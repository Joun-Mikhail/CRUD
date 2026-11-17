#!/usr/bin/env python3
"""Negative-token tests against a DEPLOYED stack: forged, re-signed, tampered and expired JWTs.

    python scripts/testing/token_security_tests.py --stack-name serverless-notes-dev \
        --output evidence/tests/token-security-tests.json [--skip-expiry]

Complements live_api_tests.py (A01-A07: garbage token, bad signature, ID token, non-Bearer
scheme, missing scope). Every request is a read (GET /notes); nothing is written.

  N01  alg "none" with the real token's claims (unsigned)
  N02  HS256 token signed with a random secret, real kid and claims (algorithm confusion)
  N03  RS256 token signed with our own RSA key, real issuer and kid (key substitution)
  N04  RS256 token from a foreign issuer (unauthorized user pool), own key and kid
  N05  real token with exp moved one day forward, original signature
  N06  real token with sub replaced (impersonation attempt), original signature
  N07  self-signed token with an exp in the past
  P01  control: the real access token is accepted
  R01  the real access token after the user was deleted (stateless JWT: expected to be
       accepted until it expires - documents the revocation limitation)
  E01  the same real token after its exp (waits ~61 min unless --skip-expiry)

A throw-away user is created (random password, never printed) and deleted right after the
token was issued, so nothing remains in the user pool even if the expiry wait is interrupted.
No token is written to disk or printed.
"""

from __future__ import annotations

import argparse
import base64
import hashlib
import hmac
import json
import os
import secrets
import sys
import time
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import boto3
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.asymmetric import padding, rsa

sys.path.insert(0, str(Path(__file__).resolve().parent))
from live_api_tests import api_full, hosted_ui_login, random_password


def b64(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).decode().rstrip("=")


def unb64(part: str) -> bytes:
    return base64.urlsafe_b64decode(part + "=" * (-len(part) % 4))


def encode(header: dict[str, Any], payload: dict[str, Any]) -> str:
    return b64(json.dumps(header, separators=(",", ":")).encode()) + "." + \
        b64(json.dumps(payload, separators=(",", ":")).encode())


def sign_rs256(header: dict[str, Any], payload: dict[str, Any], key: rsa.RSAPrivateKey) -> str:
    signing_input = encode(header, payload)
    signature = key.sign(signing_input.encode(), padding.PKCS1v15(), hashes.SHA256())
    return signing_input + "." + b64(signature)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawTextHelpFormatter)
    parser.add_argument("--stack-name", default="serverless-notes-dev")
    parser.add_argument("--region", default=os.environ.get("AWS_REGION", "eu-north-1"))
    parser.add_argument("--redirect-uri", default="http://localhost:5173/auth/callback")
    parser.add_argument("--output", default="evidence/tests/token-security-tests.json")
    parser.add_argument("--skip-expiry", action="store_true")
    args = parser.parse_args()

    stack = boto3.client("cloudformation", region_name=args.region).describe_stacks(
        StackName=args.stack_name)["Stacks"][0]
    out = {o["OutputKey"]: o["OutputValue"] for o in stack["Outputs"]}
    base, pool_id = out["ApiBaseUrl"], out["UserPoolId"]
    cognito = boto3.client("cognito-idp", region_name=args.region)

    results: list[dict[str, Any]] = []
    output = Path(args.output)

    def check(identifier: str, description: str, token: str, expected: set[int]) -> None:
        status, body, _headers = api_full(base, "GET", "/notes", raw_auth=f"Bearer {token}")
        code = (body or {}).get("error", {}).get("code") if isinstance(body, dict) else None
        passed = status in expected
        results.append({"id": identifier, "description": description, "expected": sorted(expected),
                        "actual": status, "errorCode": code, "status": "PASS" if passed else "FAIL",
                        "at": datetime.now(UTC).isoformat(timespec="seconds")})
        print(f"[{'PASS' if passed else 'FAIL'}] {identifier} {description}: {status} {code}")

    def save(note: str) -> None:
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_text(json.dumps({
            "stack": args.stack_name, "region": args.region, "endpoint": "GET /notes",
            "passed": sum(r["status"] == "PASS" for r in results),
            "failed": sum(r["status"] == "FAIL" for r in results),
            "note": note, "results": results}, indent=2) + "\n", encoding="utf-8")

    email = f"token-test-{secrets.token_hex(4)}@example.com"
    password = random_password()
    cognito.admin_create_user(UserPoolId=pool_id, Username=email, MessageAction="SUPPRESS",
                              UserAttributes=[{"Name": "email", "Value": email},
                                              {"Name": "email_verified", "Value": "true"}])
    try:
        cognito.admin_set_user_password(UserPoolId=pool_id, Username=email, Password=password,
                                        Permanent=True)
        real = hosted_ui_login(out["CognitoDomain"], out["UserPoolClientId"], args.redirect_uri,
                               email, password)["access_token"]
        head_part, payload_part, sig_part = real.split(".")
        header = json.loads(unb64(head_part))
        claims = json.loads(unb64(payload_part))
        own_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)

        check("P01", "control: real access token", real, {200})
        check("N01", "alg none, real claims, no signature",
              encode({"alg": "none", "typ": "JWT"}, claims) + ".", {401, 403})
        hs_input = encode({**header, "alg": "HS256"}, claims)
        hs_sig = hmac.new(secrets.token_bytes(32), hs_input.encode(), hashlib.sha256).digest()
        check("N02", "HS256 with a random secret (algorithm confusion)", hs_input + "." + b64(hs_sig),
              {401, 403})
        check("N03", "RS256 signed with a foreign key, real issuer and kid",
              sign_rs256(header, claims, own_key), {401, 403})
        foreign = {**claims, "iss": f"https://cognito-idp.{args.region}.amazonaws.com/{args.region}_Forged0000"}
        check("N04", "foreign issuer (unauthorized user pool), own key",
              sign_rs256({"alg": "RS256", "kid": b64(secrets.token_bytes(16))}, foreign, own_key), {401, 403})
        check("N05", "exp extended by one day, original signature",
              encode(header, {**claims, "exp": claims["exp"] + 86400}) + "." + sig_part, {401, 403})
        check("N06", "sub replaced (impersonation), original signature",
              encode(header, {**claims, "sub": "00000000-0000-4000-8000-000000000000"}) + "." + sig_part,
              {401, 403})
        check("N07", "self-signed token with exp in the past",
              sign_rs256(header, {**claims, "exp": int(time.time()) - 3600}, own_key), {401, 403})
    finally:
        cognito.admin_delete_user(UserPoolId=pool_id, Username=email)

    # After deletion the token is still a valid signed JWT until exp (no revocation check
    # in the Cognito authorizer). Recorded as an observation, expected 200.
    check("R01", "real token after the user was deleted (observation: valid until exp)", real, {200})
    save("immediate checks done; expiry check pending" if not args.skip_expiry else "expiry skipped")

    if not args.skip_expiry:
        wait = claims["exp"] - time.time() + 90
        if wait > 66 * 60:
            raise SystemExit("Refusing to wait more than 66 minutes")
        print(f"Waiting {wait / 60:.1f} min for the token to expire ...", flush=True)
        time.sleep(max(0, wait))
        check("E01", "real access token after exp (+90 s)", real, {401})
        save("all checks done")
    print(f"Wrote {output}")


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""Live acceptance + security tests against a DEPLOYED stack (real Cognito, API Gateway,
Lambda, DynamoDB). This is the only test layer that proves real JWT validation.

    python scripts/testing/live_api_tests.py --stack-name serverless-notes-dev

What it does:
  1. Reads the stack outputs.
  2. Creates two throw-away Cognito users (admin API, random passwords, never printed).
  3. Signs each in through the hosted login page with Authorization Code + PKCE, exactly
     like the browser, to obtain real access tokens carrying notes/read + notes/write.
  4. Runs the thesis test table, authentication boundary tests and cross-user isolation.
  5. Deletes the notes and the two users it created, and writes a JSON evidence file.

Required IAM permissions for the operator: cloudformation:DescribeStacks,
cognito-idp:AdminCreateUser, AdminSetUserPassword, AdminDeleteUser on the stack's pool.

First executed against the eu-north-1 development stack on 2026-11-17; results in
evidence/tests/live-api-tests.json.

Credentials: boto3 reads the usual AWS_PROFILE / AWS_* variables. A profile created with
`aws login` needs `pip install "botocore[crt]"`, or export short-lived credentials first:
    eval "$(aws configure export-credentials --profile <profile> --format env)"
"""

from __future__ import annotations

import argparse
import base64
import concurrent.futures
import hashlib
import http.cookiejar
import json
import os
import secrets
import string
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import boto3

SCOPES = "openid email notes/read notes/write"
MISSING_ID = "00000000-0000-4000-8000-000000000000"
VALID = {"title": "Live test note", "content": "created by live_api_tests.py"}


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args: Any, **kwargs: Any) -> None:
        return None


def random_password() -> str:
    alphabet = string.ascii_letters + string.digits
    return "Aa1!" + "".join(secrets.choice(alphabet) for _ in range(24))


def hosted_ui_login(domain: str, client_id: str, redirect_uri: str, username: str,
                    password: str, scopes: str = SCOPES) -> dict[str, str]:
    """Authorization Code + PKCE through the classic hosted UI, without a browser."""
    verifier = secrets.token_urlsafe(64)
    challenge = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).decode().rstrip("=")
    state = secrets.token_urlsafe(16)
    query = urllib.parse.urlencode({
        "response_type": "code", "client_id": client_id, "redirect_uri": redirect_uri,
        "scope": scopes, "state": state, "code_challenge": challenge,
        "code_challenge_method": "S256",
    })
    jar = http.cookiejar.CookieJar()
    opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))
    opener.open(f"{domain}/login?{query}", timeout=30).read()  # sets the XSRF-TOKEN cookie
    csrf = next((c.value for c in jar if c.name == "XSRF-TOKEN"), None)
    if not csrf:
        raise RuntimeError("Hosted UI did not return an XSRF-TOKEN cookie")

    no_redirect = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar), NoRedirect)
    form = urllib.parse.urlencode({"_csrf": csrf, "username": username, "password": password}).encode()
    try:
        no_redirect.open(urllib.request.Request(f"{domain}/login?{query}", data=form), timeout=30)
        raise RuntimeError("Hosted UI login did not redirect (wrong credentials?)")
    except urllib.error.HTTPError as response:
        location = response.headers.get("Location", "")
    params = urllib.parse.parse_qs(urllib.parse.urlsplit(location).query)
    if params.get("state") != [state] or "code" not in params:
        raise RuntimeError("Hosted UI login failed: no authorization code in redirect")

    token_form = urllib.parse.urlencode({
        "grant_type": "authorization_code", "client_id": client_id, "code": params["code"][0],
        "redirect_uri": redirect_uri, "code_verifier": verifier,
    }).encode()
    with urllib.request.urlopen(  # noqa: S310
        urllib.request.Request(f"{domain}/oauth2/token", data=token_form), timeout=30
    ) as response:
        return json.loads(response.read())


def api(base: str, method: str, path: str, token: str | None = None, body: Any = None,
        raw_auth: str | None = None) -> tuple[int, Any]:
    """One API call; a 429 is retried with backoff (as a real client would) so that the
    best-effort stage throttle - e.g. right after the burst test - cannot fail other checks."""
    for attempt in range(4):
        status, payload, _headers = api_full(base, method, path, token, body, raw_auth)
        if status != 429:
            break
        time.sleep(1.5 * (attempt + 1))
    return status, payload


def api_full(base: str, method: str, path: str, token: str | None = None, body: Any = None,
             raw_auth: str | None = None, extra_headers: dict[str, str] | None = None,
             raw_body: bytes | None = None) -> tuple[int, Any, dict[str, str]]:
    """Like api(), but also returns the response headers (lower-case names)."""
    headers = {"Content-Type": "application/json", **(extra_headers or {})}
    if raw_auth is not None:
        headers["Authorization"] = raw_auth
    elif token:
        headers["Authorization"] = f"Bearer {token}"
    data = raw_body if raw_body is not None else (json.dumps(body).encode() if body is not None else None)
    req = urllib.request.Request(base + path, data=data, method=method, headers=headers)  # noqa: S310
    try:
        with urllib.request.urlopen(req, timeout=30) as response:  # noqa: S310
            raw, status, got = response.read(), response.status, response.headers
    except urllib.error.HTTPError as error:
        raw, status, got = error.read(), error.code, error.headers
    lower = {k.lower(): v for k, v in got.items()}
    try:
        return status, json.loads(raw) if raw else None, lower
    except ValueError:
        return status, None, lower


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawTextHelpFormatter)
    parser.add_argument("--stack-name", default="serverless-notes-dev")
    parser.add_argument("--region", default=os.environ.get("AWS_REGION", "eu-north-1"))
    parser.add_argument("--redirect-uri", default="http://localhost:5173/auth/callback")
    parser.add_argument("--output", default="evidence/tests/live-api-tests.json")
    parser.add_argument("--origin", default="http://localhost:5173",
                        help="browser origin the stack allows (AllowedOrigin)")
    parser.add_argument("--skip-throttle", action="store_true",
                        help="skip the burst test (sends 60 unauthenticated requests at once)")
    args = parser.parse_args()

    stack = boto3.client("cloudformation", region_name=args.region).describe_stacks(
        StackName=args.stack_name)["Stacks"][0]
    out = {o["OutputKey"]: o["OutputValue"] for o in stack["Outputs"]}
    base, domain = out["ApiBaseUrl"], out["CognitoDomain"]
    pool, client_id = out["UserPoolId"], out["UserPoolClientId"]
    cognito = boto3.client("cognito-idp", region_name=args.region)

    results: list[dict[str, Any]] = []

    def check(identifier: str, description: str, actual: Any, expected: Any) -> None:
        # a list or set lists acceptable alternatives; anything else (including a tuple) is exact
        allowed = expected if isinstance(expected, (list, set)) else [expected]
        passed = actual in allowed
        results.append({"id": identifier, "description": description, "expected": expected
                        if not isinstance(expected, set) else sorted(expected),
                        "actual": actual, "status": "PASS" if passed else "FAIL"})
        print(f"[{'PASS' if passed else 'FAIL'}] {identifier:<8} {description}: {actual}")

    suffix = secrets.token_hex(4)
    users = {name: (f"live-test-{name}-{suffix}@example.com", random_password()) for name in ("a", "b")}
    created_notes: list[tuple[str, str]] = []  # (token, noteId)
    try:
        tokens: dict[str, dict[str, str]] = {}
        for name, (email, password) in users.items():
            cognito.admin_create_user(
                UserPoolId=pool, Username=email, MessageAction="SUPPRESS",
                UserAttributes=[{"Name": "email", "Value": email},
                                {"Name": "email_verified", "Value": "true"}])
            cognito.admin_set_user_password(UserPoolId=pool, Username=email,
                                            Password=password, Permanent=True)
            tokens[name] = hosted_ui_login(domain, client_id, args.redirect_uri, email, password)
        a, b = tokens["a"]["access_token"], tokens["b"]["access_token"]

        # --- Thesis table (rows 1-13) + missing delete case ----------------------------
        status, body = api(base, "POST", "/notes", a, VALID)
        check("T01", "POST valid token + body", status, 201)
        note_id = body["data"]["noteId"] if status == 201 else MISSING_ID
        created_notes.append((a, note_id))
        check("T02", "POST missing token", api(base, "POST", "/notes", None, VALID)[0], 401)
        check("T03", "POST missing title", api(base, "POST", "/notes", a, {"content": "x"})[0], 400)
        status, body = api(base, "GET", "/notes", a)
        check("T04", "GET list", status, 200)
        check("T04b", "list contains only caller's notes",
              all(n["userId"] == body["data"][0]["userId"] for n in body["data"]) if status == 200 else None, True)
        check("T05", "GET list missing token", api(base, "GET", "/notes")[0], 401)
        check("T06", "GET own note", api(base, "GET", f"/notes/{note_id}", a)[0], 200)
        check("T07", "GET other user's note", api(base, "GET", f"/notes/{note_id}", b)[0], 403)
        check("T08", "GET missing note", api(base, "GET", f"/notes/{MISSING_ID}", a)[0], 404)
        status, body = api(base, "PUT", f"/notes/{note_id}", a, {"title": "Updated", "content": "new"})
        check("T09", "PUT own note", status, 200)
        check("T10", "PUT other user's note", api(base, "PUT", f"/notes/{note_id}", b, VALID)[0], 403)
        check("T11", "PUT missing note", api(base, "PUT", f"/notes/{MISSING_ID}", a, VALID)[0], 404)
        check("T13", "DELETE other user's note", api(base, "DELETE", f"/notes/{note_id}", b)[0], 403)
        status, body = api(base, "GET", f"/notes/{note_id}", a)
        check("H01", "note unchanged by other user's attempts",
              body["data"]["title"] if status == 200 else None, "Updated")
        status, body = api(base, "GET", "/notes", b)
        check("H02", "other user's list does not contain the note",
              note_id not in [n["noteId"] for n in body["data"]] if status == 200 else None, True)

        # --- Authentication boundary (validated by API Gateway) ------------------------
        check("A01", "garbage bearer token", api(base, "GET", "/notes", "not-a-jwt")[0], 401)
        head, payload, _sig = a.split(".")
        # API Gateway's Cognito authorizer answers 403 (ACCESS_DENIED) for a well-formed JWT
        # whose signature does not verify, 401 for anything it cannot parse (observed live).
        check("A02", "tampered signature", api(base, "GET", "/notes", f"{head}.{payload}.AAAA")[0], {401, 403})
        check("A03", "ID token instead of access token",
              api(base, "GET", "/notes", tokens["a"]["id_token"])[0], {401, 403})
        check("A04", "non-Bearer scheme", api(base, "GET", "/notes", raw_auth=f"Basic {a}")[0], 401)
        # Unknown route WITH an Authorization header: API Gateway raises 403
        # IncompleteSignatureException, which has no gateway response type of its own and is
        # answered by DEFAULT_4XX (measured 2026-11-17). Without the header it is a 404 (R01).
        status, body = api(base, "GET", "/nope", a)
        check("A05", "unknown route with token", (status, body["error"]["code"] if body else None),
              (403, "BAD_REQUEST"))
        if "ReadOnlyTestClientId" in out:
            email, password = users["a"]
            read_only = hosted_ui_login(domain, out["ReadOnlyTestClientId"], args.redirect_uri,
                                        email, password, "openid notes/read")["access_token"]
            check("A06", "read-only token can list", api(base, "GET", "/notes", read_only)[0], 200)
            check("A07", "read-only token cannot create (missing scope)",
                  api(base, "POST", "/notes", read_only, VALID)[0], {401, 403})
        else:
            print("[SKIP] A06/A07 need EnableScopeTestClient=true")

        # --- Routing, validation, CORS and limits ---------------------------------------
        status, body = api(base, "GET", "/nope")
        check("R01", "unknown route without token", (status, body["error"]["code"] if body else None), (404, "NOT_FOUND"))
        status, body = api(base, "PATCH", f"/notes/{note_id}", a, VALID)
        check("R02", "unsupported method with token", (status, body["error"]["code"] if body else None),
              (403, "BAD_REQUEST"))
        status, body = api(base, "POST", "/notes", a, {**VALID, "userId": "someone-else"})
        check("V01", "client-supplied userId rejected", (status, body["error"]["code"] if body else None), (400, "VALIDATION_ERROR"))
        check("V02", "malformed JSON", api_full(base, "POST", "/notes", a, raw_body=b"{nope")[0], 400)
        check("V03", "invalid note id", api(base, "GET", "/notes/not-a-uuid", a)[0], 400)
        check("V04", "body over 128 KB", api_full(base, "POST", "/notes", a, raw_body=json.dumps(
            {"title": "big", "content": "x" * (130 * 1024)}).encode())[0], 413)
        origin = {"Origin": args.origin}
        _s, _b, pre = api_full(base, "OPTIONS", "/notes", extra_headers={
            **origin, "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "authorization,content-type"})
        check("C01", "preflight allows the configured origin",
              (_s, pre.get("access-control-allow-origin")), (200, args.origin))
        check("C02", "preflight allows Authorization header",
              "authorization" in pre.get("access-control-allow-headers", "").lower(), True)
        check("C03", "CORS header on a successful response",
              api_full(base, "GET", "/notes", a, extra_headers=origin)[2].get("access-control-allow-origin"), args.origin)
        check("C04", "CORS header on a gateway 401",
              api_full(base, "GET", "/notes", extra_headers=origin)[2].get("access-control-allow-origin"), args.origin)

        check("T12", "DELETE own note", api(base, "DELETE", f"/notes/{note_id}", a)[0], 200)
        check("T14", "GET after delete", api(base, "GET", f"/notes/{note_id}", a)[0], 404)
        check("T15", "DELETE missing note", api(base, "DELETE", f"/notes/{note_id}", a)[0], 404)
        created_notes.clear()

        if not args.skip_throttle:
            # Stage throttle: 10 req/s, burst 20. Requests rejected by the authorizer are not
            # throttled (measured: 60 unauthenticated requests -> 60 x 401), so the burst uses a
            # valid token. API Gateway throttles on a best-effort basis: on 2026-11-17 a burst of
            # 60 was not throttled at all and bursts of 120 at ~450 req/s had 15 and 46 x 429.
            # Two rounds of 120 list calls (each at most one Lambda + one Query, ~$0.001 total).
            def one(_i: int) -> tuple[int, Any]:
                status, body, _headers = api_full(base, "GET", "/notes", a)  # no retry here
                return status, body

            responses: list[tuple[int, Any]] = []
            for _round in range(2):
                with concurrent.futures.ThreadPoolExecutor(max_workers=120) as executor:
                    responses += list(executor.map(one, range(120)))
            statuses = [status for status, _ in responses]
            counts = {code: statuses.count(code) for code in sorted(set(statuses))}
            print(f"         2 bursts of 120 -> {counts}")
            check("L01", "burst above the stage limit is throttled (429 present)", 429 in counts, True)
            check("L02", "burst produces only 200/429", set(counts) <= {200, 429}, True)
            throttled = next((body for status, body in responses if status == 429), None)
            check("L03", "429 uses the error envelope",
                  throttled["error"]["code"] if throttled else None, "THROTTLED")
    finally:
        for token, created_id in created_notes:
            api(base, "DELETE", f"/notes/{created_id}", token)
        for email, _ in users.values():
            try:
                cognito.admin_delete_user(UserPoolId=pool, Username=email)
            except cognito.exceptions.UserNotFoundException:
                pass

    failed = [r for r in results if r["status"] == "FAIL"]
    report = {"stack": args.stack_name, "region": args.region,
              "executedAt": datetime.now(UTC).isoformat(timespec="seconds"),
              "passed": len(results) - len(failed), "failed": len(failed), "results": results,
              "notAutomated": ["expired token (wait for the 60 min access-token lifetime, then expect 401)",
                               "token from a different user pool / wrong issuer (needs a second pool)"]}
    Path(args.output).parent.mkdir(parents=True, exist_ok=True)
    Path(args.output).write_text(json.dumps(report, indent=2) + "\n")
    print(f"\n{report['passed']} passed, {report['failed']} failed -> {args.output}")
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()

# Lesson 7 — Cognito and JWT

## In one minute
**Cognito** is the managed user directory: it stores accounts, checks passwords and hands out **tokens**. A token is a **JWT**: a small signed text that says who the user is, what they may do, and until when. The browser sends the token with every API call; API Gateway verifies the signature and lets the request through. The backend never sees a password.

## Authentication vs authorization
| | Question | Done by | Failure |
|---|---|---|---|
| Authentication | Who are you? | Cognito (issues token) + API Gateway (verifies it) | 401 |
| Authorization | May you do this to *this* note? | Lambda + DynamoDB condition (owner check); scopes at the gateway | 403 |

A valid token is not enough: Bob has a perfectly valid token and still must not read Alice's note.

## What a JWT looks like
Three base64url parts separated by dots: `header.payload.signature`.

```
eyJraWQiOiJhYmMiLCJhbGciOiJSUzI1NiJ9 . eyJzdWIiOiJjM2E0Li4uIiwidG9rZW5fdXNlIjoiYWNjZXNzIiwic2NvcGUiOiJub3Rlcy9yZWFkIG5vdGVzL3dyaXRlIiwiZXhwIjoxNzY5ODY0NDAwfQ . <signature>
```
| Part | Decoded | Purpose |
|---|---|---|
| Header | `{"kid":"abc","alg":"RS256"}` | which key and algorithm signed it |
| Payload (claims) | see below | the statements being made |
| Signature | bytes | proof the header and payload were issued by Cognito and not changed |

Claims in a Cognito **access token**:
| Claim | Meaning |
|---|---|
| `iss` | issuer: `https://cognito-idp.eu-central-1.amazonaws.com/<userPoolId>` |
| `sub` | the user's permanent unique id — this becomes `userId` on notes |
| `client_id` | which app client requested the token |
| `token_use` | `access` (an ID token says `id`) |
| `scope` | e.g. `openid email notes/read notes/write` |
| `exp` / `iat` | expiry and issue time (Unix seconds); here valid for 60 minutes |

The payload is **only encoded, not encrypted** — anyone can read it. Never put secrets in a token. What cannot be done is *changing* it: Cognito signs with a private key (RS256); everyone can verify with the public key published at `…/<poolId>/.well-known/jwks.json`. Change one character of the payload and the signature no longer matches.

(The semestral report's figure shows `HS256` with a shared secret — that is a different scheme from the one Cognito uses.)

**Access token vs ID token.** The ID token describes the user to the *app* (e-mail, name). The access token is the credential for *APIs* and carries scopes. This API accepts only access tokens: the routes require a scope, and Lambda double-checks:
```python
# backend/src/notes_api/security/identity.py
token_use = claims.get("token_use")
if token_use is not None and token_use != "access":
    raise UnauthenticatedError("An access token is required")
```

## How the browser gets a token: Authorization Code + PKCE
The app cannot keep a secret (anyone can read browser code), so it proves "I am the one who started this login" with PKCE:

```mermaid
sequenceDiagram
  participant A as App (browser)
  participant C as Cognito login page
  A->>A: verifier = random; challenge = SHA-256(verifier); state = random
  A->>C: go to /oauth2/authorize?…&code_challenge=…&state=…
  Note over C: user types e-mail + password HERE, not in the app
  C-->>A: back to /auth/callback?code=XYZ&state=…
  A->>A: state must equal what I stored
  A->>C: POST /oauth2/token (code=XYZ, code_verifier=verifier)
  C->>C: SHA-256(verifier) == challenge?
  C-->>A: access token + ID token + refresh token
```
A stolen `code` is useless without the `verifier`, which never left the browser. `state` stops an attacker from injecting their own login response.

Where tokens live: in JavaScript memory only (`frontend/src/services/auth/cognitoAuth.ts`), not in `localStorage`. The refresh token (1 day) gets new access tokens silently.

## Who verifies what
| Check | Where |
|---|---|
| signature, issuer, expiry | API Gateway Cognito authorizer |
| access token with the route's scope | API Gateway (`AuthorizationScopes`) |
| `sub` present, `token_use`, scope again | Lambda (`security/identity.py`) — defence in depth |
| note belongs to `sub` | service + DynamoDB condition |

Lambda trusts `event["requestContext"]["authorizer"]["claims"]` because only API Gateway can fill it, and only after verification. It never reads identity from the body, query or headers.

In the Local Demo none of this exists: `Authorization: Demo alice` is simply trusted. That is why the UI says "authentication is simulated".

## Important source files
`infrastructure/template.yaml` (`UserPool`, `WebClient`, `NotesResourceServer`) · `backend/src/notes_api/security/identity.py` · `frontend/src/services/auth/cognitoAuth.ts` · `frontend/src/utils/pkce.ts` · `docs/security/SECURITY.md`

## بالعربي (مصري)
- الـ **JWT** زي كارنيه مختوم: مكتوب عليه إنت مين (`sub`) ومسموحلك بإيه (`scope`) وصلاحيته لحد إمتى (`exp`). أي حد يقدر **يقرا** المكتوب عليه، بس محدش يقدر **يغيّره** من غير ما الختم (الـ signature) يبوظ.
- **Access token** ده اللي بنبعته للـ API. **ID token** ده معلومات عن المستخدم للتطبيق نفسه (زي الإيميل). الـ API هنا بيقبل الـ access token بس.
- **PKCE**: التطبيق بيعمل رقم سري عشوائي (verifier) ويبعت لـ Cognito الـ hash بتاعه بس. لما يرجع بالـ code بيبعت الرقم الأصلي. فلو حد سرق الـ code في السكة مش هيعرف يستخدمه.
- الباسورد بيتكتب في صفحة Cognito نفسها، مش في التطبيق بتاعنا. التطبيق والـ backend عمرهم ما بيشوفوا الباسورد.

## Practical exercise
1. Decode a token payload by hand (this is a made-up token, not a real one):
```bash
python3 - <<'PY'
import base64, json
payload = "eyJzdWIiOiJjM2E0IiwidG9rZW5fdXNlIjoiYWNjZXNzIiwic2NvcGUiOiJub3Rlcy9yZWFkIG5vdGVzL3dyaXRlIiwiZXhwIjoxNzY5ODY0NDAwfQ"
print(json.loads(base64.urlsafe_b64decode(payload + "=" * (-len(payload) % 4))))
PY
```
2. Run `cd backend && .venv/bin/pytest tests/unit/test_identity.py -v` and read `test_identity_is_never_read_from_headers_or_body`.
3. Run `cd frontend && npx vitest run src/services/auth` and find the test that proves tokens are not written to browser storage.

## Check your understanding
1. Is a JWT payload secret? What protects it?
2. Which claim identifies the user, and where is it used in the database?
3. Why does the API refuse ID tokens?
4. What problem does PKCE solve, and what are `code_verifier` and `code_challenge`?
5. What is `state` for?
6. Why does Lambda not verify the signature itself?
7. Bob has a valid token. Why can he still not read Alice's note?

<details><summary>Answers</summary>

1. No — it is only base64url-encoded. The signature protects its integrity, not its secrecy.
2. `sub`; it is stored as `userId` on every note and compared on every access.
3. ID tokens are meant for the client and carry no API scopes; the authorizer requires scopes, which only access tokens have.
4. A public client cannot hold a secret, so an intercepted authorization code could be redeemed by someone else. The verifier is a random secret kept in the browser; the challenge is its SHA-256 hash sent at the start. Cognito only issues tokens to whoever presents the matching verifier.
5. A random value echoed back by Cognito; the app checks it to ensure the response belongs to the login it started (protection against login CSRF).
6. API Gateway already did, and the claims in the event can only come from the authorizer; repeating RSA verification would add latency and a dependency for no gain.
7. Authentication succeeded, authorization fails: the note's `userId` is Alice's `sub`, not Bob's → 403.
</details>

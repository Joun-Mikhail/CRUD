# Security evaluation (bachelor stage, 2026-11-17)

Scope: the deployed development stack `serverless-notes-dev` (eu-north-1) and the hosted client. The threat model and the design of the controls are in [`SECURITY.md`](SECURITY.md); this document records what was **tested** and what remains. No real user's password or token was used; every live test ran with throw-away Cognito users that were deleted afterwards.

Evidence files:
- `evidence/tests/live-api-tests.json` — 38 live checks (thesis table, authentication boundary, isolation, validation, CORS, throttling), 38/38 passed;
- `evidence/tests/token-security-tests.json` — negative-token tests N01–N07, revocation observation R01, expiry E01 (`scripts/testing/token_security_tests.py`);
- `evidence/tests/backend-pytest.txt` — 193 automated tests incl. `backend/tests/security/` (isolation, ownership, disclosure, log hygiene, concurrency, IAM and template assertions);
- `evidence/aws/cloudwatch.txt`, `evidence/aws/bachelor-evaluation.json` — log hygiene, alarms;
- configuration read on 2026-11-17 with `cognito-idp describe-user-pool`, `describe-user-pool-client`, `dynamodb describe-table`, `describe-continuous-backups`, `apigateway get-stage`.

## Results

| # | Threat | Existing protection | Test performed | Result | Remaining limitation |
|---|---|---|---|---|---|
| 1 | Unauthenticated access | Cognito authorizer on every route | live T02, T05 (no token), A01 (garbage), A04 (non-Bearer) | **401** in all cases | — |
| 2 | Unsigned token (`alg: none`) | authorizer verifies RS256 signatures only | N01 | **401** | — |
| 3 | Algorithm confusion (HS256 with a guessed secret) | authorizer accepts only the pool's RSA keys | N02 | **401** | — |
| 4 | Token signed with an attacker's key but the real issuer and `kid` | signature verified against the pool's JWKS | N03 | **403** | — |
| 5 | Token from an unauthorized issuer (another user pool) | issuer must equal the configured pool | N04 (self-signed, foreign `iss` and `kid`) | **401** | A token from a *real* second Cognito pool was not used (no extra pool created); N03/N04 cover the signature and issuer checks |
| 6 | Tampering with claims (extend `exp`, change `sub` to impersonate) | signature covers header and payload | N05, N06, A02 | **403** | — |
| 7 | Expired token | authorizer checks `exp` | N07 (self-signed, past `exp`) → 401; **E01: a real access token 90 s after its `exp`** | N07 **401**; E01 see below | — |
| 8 | Wrong token type (ID token used as access token) | `AuthorizationScopes` on each route: ID tokens carry no custom scopes | live A03 | **401** | — |
| 9 | Missing or insufficient scope | per-route scopes `notes/read` / `notes/write` | live A06 (read-only token lists: 200), A07 (read-only token creates: 401) | as designed | API Gateway answers 401, not 403, for a missing scope (measured) |
| 10 | Broken object-level authorization (another user's note) | owner = `sub` from verified claims; ownership inside DynamoDB condition expressions | live T07, T10, T13 (403), H01 (note unchanged), H02 (not in the other user's list); pytest `tests/security/test_isolation.py`; browser test with two users | **403**, data unchanged | 403 vs 404 reveals that a guessed UUID exists (required by the assignment) |
| 11 | Mass assignment (client sets `userId`, `version`, timestamps) | unknown fields rejected | live V01; unit tests | **400** | — |
| 12 | Malformed or oversized input, injection | strict validation, 128 KiB limit, expression placeholders only | live V02–V04; 40+ validation tests | **400 / 413**, never 5xx | bodies > 10 MB: API Gateway's plain 413 without CORS |
| 13 | Sensitive data exposure in errors and logs | generic 500 message; no titles, content, tokens or e-mails logged | pytest log-hygiene tests; CloudWatch inspection after all runs | no leak found | — |
| 14 | Token theft in the browser | tokens in memory only; CSP; security headers | Playwright on the public URL: no token in storage, cookies or DOM | as designed | an injected script could still read memory (no backend-for-frontend) |
| 15 | Excessive privileges | one DynamoDB action per function on the table/index ARN; no `Scan` | template tests; deployed roles inspected (`evidence/aws/deployed-resources.txt`) | least privilege confirmed | — |
| 16 | Revocation after sign-out or account deletion | refresh-token revocation enabled; access tokens 60 min | **R01: the access token of a deleted user was still accepted (200, empty list)** | observed | stateless JWTs stay valid until `exp` (≤ 60 min); a short token lifetime is the mitigation |
| 17 | Credential stuffing, sign-up abuse, request floods | password policy (≥ 12 chars, 4 classes), e-mail verification, `PreventUserExistenceErrors` on the client, throttling 10 req/s per method | configuration read; live L01–L03, single-method throttle run (6–17 % 429) | partly mitigated | no MFA, no WAF/CAPTCHA, throttling is shared by all users (not per user), sign-up reveals registered e-mails |
| 18 | Transport security | HTTPS only (API Gateway, CloudFront redirect + HSTS), private S3 with OAC | `evidence/tests/frontend-hosting-http-checks.txt` | as designed | default `*.cloudfront.net` certificate, TLS policy not configurable |
| 19 | Data loss | DynamoDB SSE enabled; on-demand; multi-AZ by the service | `describe-table`, `describe-continuous-backups` | encryption **ENABLED**; **PITR DISABLED**, deletion protection off (table and pool) | dev stage has no backups; enable PITR and deletion protection for `Stage=prod` (template already enables PITR for prod) |

### E01 — expired real token

A real Cognito access token was sent 90 s after its `exp` (2026-11-17T20:07:07+00:00): API Gateway answered **401 UNAUTHORIZED** — expired tokens are rejected (PASS). The same token had been accepted before expiry (P01) and after the user was deleted (R01).

## Configuration review (read 2026-11-17)

| Setting | Value | Assessment |
|---|---|---|
| User pool MFA | OFF | limitation (optional TOTP MFA would be free; not required by the assignment) |
| Password policy | min. 12, upper, lower, number, symbol | adequate |
| Account recovery | verified e-mail | adequate |
| Feature plan | Lite (no threat protection) | paid tiers not used, by decision |
| App client | public (no secret), `code` flow only, SRP + refresh, `PreventUserExistenceErrors` ENABLED, token revocation ON, access token 60 min, refresh 1 day | adequate for a browser client with PKCE |
| DynamoDB | on-demand, SSE ENABLED, GSI `byUser`, PITR DISABLED, deletion protection off | acceptable for dev; production needs PITR and deletion protection |
| API stage | throttling 10 req/s, burst 20 for `*/*` (per method), metrics and data trace off | data trace off is correct (it would log request bodies) |

## Conclusion

No critical vulnerability was found, so no code or infrastructure change was needed. All tested attacks on authentication, token integrity, authorization and input handling were rejected at the gateway or in the function, and ownership is enforced atomically in the database. The remaining risks are accepted limitations of a development-stage, low-cost prototype: no MFA/WAF, shared throttling, access tokens valid until expiry, no backups in `dev`, and no independent penetration test.

# Security

## Verification status (read this first)

| Layer | Status |
|---|---|
| Ownership / isolation logic, validation, error and log hygiene (Lambda code) | **Verified** by automated tests against in-memory DynamoDB (`backend/tests/security`, `tests/integration`) |
| Frontend token handling (PKCE, state check, in-memory tokens) | **Verified** by unit tests with a mocked Cognito |
| Real JWT validation by API Gateway (missing, garbage, tampered and ID tokens, non-Bearer scheme, missing scope) | **Verified on AWS** (eu-north-1, 2026-11-17): all rejected — live checks A01–A07 in `evidence/tests/live-api-tests.json` |
| Cross-user isolation on the real stack (read, update, delete, list) | **Verified on AWS**: 403 for the other user's note, note unchanged, not in the other user's list (T07, T10, T13, H01, H02); also in the browser with two real Cognito users |
| IAM policies in effect | **Verified on AWS**: each function's role has exactly one DynamoDB action on the table or index ARN plus `AWSLambdaBasicExecutionRole` (`evidence/aws/deployed-resources.txt`); every API call in the live suite succeeded, so no action is missing |
| Real Cognito flows | **Verified on AWS**: sign-up, wrong-code rejection, hosted sign-in with PKCE + `state`, session restore, sign-out. Entering a real e-mailed code and password reset were checked manually by the project owner on 2026-11-17 (manual; no evidence file) |
| Tokens in the browser | **Verified on AWS**: none in `localStorage`, `sessionStorage`, app cookies or the DOM |
| Log hygiene in CloudWatch | **Verified on AWS**: no note text, tokens, passwords or e-mail addresses in the five log groups after the test runs (`evidence/aws/cloudwatch.txt`) |
| Expired token, foreign issuer, forged/tampered tokens | **Verified on AWS** (2026-11-17): `alg none`, HS256, foreign key, foreign issuer, modified `exp`/`sub`, self-signed expired → all rejected; real token after expiry → 401 (PASS); `evidence/tests/token-security-tests.json`, [SECURITY_EVALUATION.md](SECURITY_EVALUATION.md) |

## Threat model

Assets: note contents; user accounts; the AWS account (cost).

| # | Threat | Mitigation | Where |
|---|---|---|---|
| T1 | Unauthenticated access to the API | Every method has the Cognito authorizer; requests without a valid access token never reach Lambda | `template.yaml` `Auth.DefaultAuthorizer` |
| T2 | Forged / tampered / expired token | API Gateway verifies RS256 signature against the pool's JWKS, `iss`, `exp` | Cognito authorizer |
| T3 | ID token used as API credential | Authorizer requires OAuth scopes ⇒ only access tokens pass; Lambda also rejects `token_use != access` | `AuthorizationScopes`, `security/identity.py` |
| T4 | User B reads/changes/deletes user A's note (IDOR) | Ownership check in the service (GET) and inside the conditional write (PUT/DELETE) | `notes_service.py`, `notes_repository.py` |
| T5 | Client assigns another owner (mass assignment) | Unknown body fields rejected; `userId` comes only from verified claims | `validation/notes.py`, `http.py` |
| T6 | Race between ownership check and write | Check and write are one atomic conditional operation | `notes_repository.py` |
| T7 | Pagination token used to read another user's partition | Token holds no user id; server always adds the caller's | `pagination.py` |
| T8 | Injection | DynamoDB expressions use placeholders (`:owner`) only; values are never concatenated into expressions; no SQL, shell or `eval` | repository |
| T9 | Stored XSS via note text | API stores text verbatim and returns JSON with `nosniff`; React escapes all output; strict CSP (`script-src 'self'`) | `http.py`, `frontend/csp.ts` |
| T10 | Information leakage in errors | Generic 500 body; stack traces only in logs; 403 body reveals neither content nor owner | `http.py` |
| T11 | Sensitive data in logs | Logs contain ids/status/duration only — never title, content, headers or tokens (asserted by a test) | `logging_utils.py`, `test_logs_contain_no_note_content_or_credentials` |
| T12 | Token theft from browser storage | Tokens kept in memory only; PKCE verifier/state in `sessionStorage` only during the redirect | `frontend/src/services/auth/cognitoAuth.ts` |
| T13 | Authorization-code interception / login CSRF | PKCE (S256) + `state` verified on callback | same |
| T14 | Cost exhaustion / abuse | Stage throttling 10 req/s (burst 20) → 429; 128 KiB body limit; on-demand billing with alarms. Measured: the throttle is approximate and is not applied to requests the authorizer rejects; after a burst it can keep throttling one method for minutes (`docs/performance/PERFORMANCE.md`) | `MethodSettings`, `config.py` |
| T15 | Over-privileged functions | One IAM action per function, scoped to the table or index ARN; no wildcards | `template.yaml` `Policies` |
| T16 | Cross-origin abuse | CORS allows one configured origin; no credentials/cookies are used at all | `Cors`, `CORS_ALLOW_ORIGIN` |
| T17 | Account enumeration | `PreventUserExistenceErrors: ENABLED` on the app client (sign-in and password reset; the reset screen shows the same message whether or not the address is registered). Sign-**up** still reveals that an e-mail is registered — inherent to Cognito self-registration | `WebClient` |
| T18 | Leaked long-lived cloud credentials | CI deploys with GitHub OIDC short-lived roles; no keys in the repo; `.env.aws` holds identifiers only | `deploy.yml` |

## Authentication: Cognito and JWT

User pool configuration (`UserPool`): e-mail as username (case-insensitive), e-mail verification by code, self sign-up enabled, password ≥ 12 characters with upper/lower/number/symbol, account recovery by verified e-mail, MFA off (see limitations).

App client (`WebClient`): public (no secret); OAuth flow `code` only; scopes `openid email notes/read notes/write`; exact callback/logout URLs; token revocation on; access and ID tokens 60 minutes, refresh token 1 day.

A JWT is three base64url parts, `header.payload.signature`:

| Part | Content in a Cognito access token |
|---|---|
| Header | `alg: RS256`, `kid` — which of the pool's public keys signed it |
| Payload | `iss` = `https://cognito-idp.eu-north-1.amazonaws.com/<poolId>`; `sub` = user id; `client_id` = app client (access tokens have no `aud`; ID tokens do); `token_use` = `access`; `scope` = `openid email notes/read notes/write`; `exp`, `iat`, `auth_time`, `jti`, `username` |
| Signature | RSA-SHA256 over `header.payload` with Cognito's private key |

Who verifies what:

| Check | Where |
|---|---|
| Signature (JWKS of the configured pool), `iss`, `exp` | API Gateway Cognito authorizer |
| Token is an access token and contains the route's scope | API Gateway (because `AuthorizationScopes` is set) |
| `sub` present, `token_use == access`, scope present (defence in depth) | Lambda `security/identity.py` |
| Resource ownership | Lambda service + DynamoDB condition |

The thesis text and its JWT figure show an HS256 token with an `aud` claim checked by API Gateway; in reality Cognito signs with RS256 and access tokens carry `client_id` rather than `aud`. The thesis's Cognito figure shows *identity pools* (AWS credentials via STS), which this system does not use — only a *user pool*.

Lambda does not re-verify the signature: the event's `requestContext.authorizer.claims` can only be populated by API Gateway, and the function is invokable only by this API (resource policy created by SAM).

## Authorization

Authentication answers "who are you"; authorization answers "may you do this to *this note*". For every operation the handler (1) takes the user id from verified claims, (2) validates the id/body, (3) lets the service/repository enforce ownership, (4) maps the outcome to 200/403/404/409. Hiding buttons in the UI is never relied upon. See `docs/api/API.md` for the 403-vs-404 disclosure trade-off.

## IAM (least privilege)

| Function | Allowed action | Resource |
|---|---|---|
| CreateNote | `dynamodb:PutItem` | table |
| GetNote | `dynamodb:GetItem` | table |
| UpdateNote | `dynamodb:UpdateItem` | table |
| DeleteNote | `dynamodb:DeleteItem` | table |
| ListNotes | `dynamodb:Query` | index `byUser` only |

Plus log writing, limited by SAM to each function's own log group. No function can `Scan`, touch another table, or call Cognito.

## CORS, headers, secrets

- CORS: single origin from the `AllowedOrigin` parameter (pattern forbids `*`), since 2026-11-17 the hosted site `https://d11c0a7q5fx9qi.cloudfront.net`; local development reaches the API through the Vite dev-server proxy (same-origin), so localhost is no longer an allowed origin; methods `GET,POST,PUT,DELETE,OPTIONS`; headers `Authorization,Content-Type`. The API uses bearer tokens, not cookies, so CSRF against the API does not apply.
- Response headers: `Cache-Control: no-store`, `X-Content-Type-Options: nosniff`.
- Frontend CSP (production build): `default-src 'self'; script-src 'self'; style-src 'self'; connect-src` limited to the configured API and Cognito origins; `object-src 'none'`.
- Frontend hosting (ADR 0009): private S3 bucket (all public access blocked, ACLs disabled, SSE-S3, versioned); the bucket policy allows only `s3:GetObject` by the CloudFront service principal with `AWS:SourceArn` = this distribution and denies any request without TLS. Direct S3 URLs answer 403 (checked 2026-11-17). CloudFront redirects HTTP to HTTPS and adds `Strict-Transport-Security: max-age=63072000; includeSubDomains`, `Content-Security-Policy: frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'self'; upgrade-insecure-requests` (in addition to the page's `<meta>` CSP, which carries `connect-src`), `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, `Permissions-Policy` and `Cross-Origin-Opener-Policy: same-origin`. Cognito accepts the CloudFront URL as callback/logout URL; `localhost` stays allowed for development.
- Secrets: the system has none to store. No client secret (public client), no API keys, no database password (IAM roles). Pool id, client id and API URL are identifiers, not secrets.

## Known limitations

1. Development stage only. Expired-token and wrong-issuer cases, alarm notifications and a penetration test were not performed (see "Verification status").
2. MFA is off; no advanced threat protection (requires a paid Cognito tier); no WAF or CAPTCHA in front of sign-up. The hosted site uses the default `*.cloudfront.net` certificate, so its minimum TLS version follows CloudFront's default (a custom domain would allow TLS 1.2+ only).
3. Throttling is per method (10 req/s, burst 20 each; measured 2026-11-17), not per user: one abusive user can consume the shared budget (usage plans/API keys or WAF rate rules would fix this).
4. Sign-up reveals whether an e-mail is already registered.
5. 403 vs 404 reveals that a guessed UUID exists (required by the thesis; see API.md).
6. The pagination token is not signed. It is safe (cannot cross users) but a client can craft positions within its own notes.
7. Access tokens stay valid until they expire (≤ 60 min) even after sign-out; only the refresh token is revoked.
8. An in-memory token is still readable by malicious script running in the page; the CSP and React's escaping are the defences. A backend-for-frontend with HttpOnly cookies would be stronger and is out of scope.
9. The default Cognito e-mail sender is limited to a small number of e-mails per day; production use needs Amazon SES.
10. `Stage=dev` deletes data with the stack and has no backups.

## Reporting a vulnerability

This is a student project. Open a private security advisory on the GitHub repository or contact the repository owner directly; do not open a public issue containing exploit details.

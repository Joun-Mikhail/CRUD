# Testing

Local results were last produced on 2026-11-17 on Windows 11 (Python 3.13.17, Node 26); CI runs the same suites on Linux. **AWS results** come from the development stack `serverless-notes-dev` deployed to eu-north-1 on 2026-11-17 (section "Live AWS tests"). Raw outputs are stored in [`evidence/`](../../evidence).

## Summary of executed checks

| Check | Command | Result | Evidence |
|---|---|---|---|
| Backend tests | `cd backend && .venv/bin/pytest --cov` | **187 passed**, 0 failed | `evidence/tests/backend-pytest.txt` |
| Backend coverage | (same) | **99.01 %** line+branch of `src/notes_api`; gate 85 % | same |
| Backend lint/format/types | `ruff check .`, `ruff format --check .`, `mypy` (strict) | no findings | `evidence/tests/backend-static-analysis.txt` |
| Backend dependency audit | `pip-audit` | no known vulnerabilities | same |
| Frontend unit/component tests | `cd frontend && npm test` | **66 passed** (4 files) | `evidence/tests/frontend-vitest.txt` |
| Frontend lint/types | `npm run lint`, `npm run typecheck` | no findings | `evidence/tests/frontend-static-analysis.txt` |
| Frontend dependency audit | `npm audit --omit=dev` | 0 vulnerabilities | same |
| Browser end-to-end | `npm run test:e2e -- --trace off` | **14 passed** (Chromium, Local Demo), including the axe accessibility audit | `evidence/tests/frontend-e2e-playwright.txt` |
| Production build | `npm run build` | passes; JS 131.9 kB gzip | `evidence/builds/frontend-build.txt` |
| Production build smoke | built app served by `vite preview`, driven by Playwright through 6 pages | no console/CSP errors | (manual run, not stored) |
| Infrastructure | `cfn-lint`, `sam validate` (SAM transform), `sam validate --lint`, `sam build` | no findings; valid; build succeeded | `evidence/builds/infrastructure-validation.txt` |
| CloudFormation change set and deployment (eu-north-1) | `sam deploy --no-execute-changeset`, then execution after review | first change set rejected by the SAM transform (fixed); the reviewed change set (33 additions) reached `CREATE_COMPLETE` in about 90 s with no failed resource | `evidence/builds/aws-changeset-create.txt`, `evidence/aws/stack-events.txt`, `evidence/aws/deployed-resources.txt` |
| OpenAPI | `openapi-spec-validator docs/api/openapi.yaml` | OK | — |
| Latency benchmark (local only) | `scripts/testing/benchmark.py`, 100 cycles | 100 % success | `evidence/benchmarks/local-demo-benchmark.json` |
| CI on GitHub Actions | `.github/workflows/ci.yml` on pull request #1 | all 4 jobs green (backend, frontend, browser e2e, infrastructure) | PR #1 checks |
| **Live AWS tests** | `scripts/testing/live_api_tests.py` | **38 passed, 0 failed** on the deployed stack | `evidence/tests/live-api-tests.json`, `live-api-tests.txt` |
| **AWS browser test** | the React app in AWS mode, driven through Playwright | sign-up, sign-in, CRUD, reload, isolation, sign-out all work (details below) | `evidence/screenshots/aws-*.png` |
| **Hosted frontend (CloudFront)** | curl checks, live suite with `--origin https://d11c0a7q5fx9qi.cloudfront.net`, Playwright on the public URL | headers, HTTPS redirect, deep links, private bucket (403), CORS as designed; live suite **38/38**; sign-in, CRUD, reload, sign-out pass | `evidence/tests/frontend-hosting-http-checks.txt`, `evidence/tests/live-api-tests.json`, `evidence/screenshots/aws-13-hosted-cloudfront-notes.png` |
| **AWS benchmark** | `scripts/testing/benchmark.py`, 100 cycles | 500/500 requests succeeded; median ≈ 120 ms | `evidence/benchmarks/aws-dev-eu-north-1.json` |
| **CloudWatch** | logs, Logs Insights, alarm metrics | structured logs, no data leaks, alarms `OK` with data | `evidence/aws/cloudwatch.txt` |

## Test layers and what each one proves

```
backend/tests/unit/          pure logic, no AWS            validation, pagination tokens, identity extraction,
                                                           service rules (fake repository), handler wrapper
backend/tests/integration/   in-memory DynamoDB (moto)     repository (serialization, index, conditions),
                                                           full handler→service→repository flow, Local Demo HTTP server
backend/tests/security/      in-memory DynamoDB (moto)     cross-user isolation, ownership, disclosure, log hygiene,
                                                           concurrency
frontend/src/**/*.test.ts(x) jsdom, mocked fetch/API       API client, PKCE, Cognito flows, pages and forms
frontend/tests/e2e/          real browser + Local Demo     complete user journeys, responsiveness
backend/tests/security/test_template.py  template file      authorizer + scope per route, one IAM action, gateway envelopes
scripts/testing/live_api_tests.py   real AWS (eu-north-1)  real JWT validation, real Cognito, IAM, CORS, throttling
```

`moto` emulates DynamoDB. It is faithful for the calls used here (conditional writes, `ReturnValuesOnConditionCheckFailure`, GSI queries, pagination) but it is not DynamoDB; GSI eventual consistency, throttling and real latencies are not reproduced.

### Thesis test table (semestral report, 13 rows)

Each row is one test named `test_thesis_table_NN_…` in `backend/tests/integration/test_api_flow.py`:

| # | Request | Condition | Expected | Local result | AWS result (2026-11-17) |
|---|---|---|---|---|---|
| 1 | POST /notes | valid token, valid body | 201 | pass | pass (201) |
| 2 | POST /notes | missing token | 401 | pass¹ | pass (401) |
| 3 | POST /notes | missing title | 400 | pass | pass (400) |
| 4 | GET /notes | valid token | 200 | pass | pass (200) |
| 5 | GET /notes | missing token | 401 | pass¹ | pass (401) |
| 6 | GET /notes/{id} | own note | 200 | pass | pass (200) |
| 7 | GET /notes/{id} | other user's note | 403 | pass | pass (403) |
| 8 | GET /notes/{id} | non-existing | 404 | pass | pass (404) |
| 9 | PUT /notes/{id} | own note, valid body | 200 | pass | pass (200) |
| 10 | PUT /notes/{id} | other user's note | 403 | pass | pass (403) |
| 11 | PUT /notes/{id} | non-existing | 404 | pass | pass (404) |
| 12 | DELETE /notes/{id} | own note | 200 | pass | pass (200) |
| 13 | DELETE /notes/{id} | other user's note | 403 | pass | pass (403) |
| + | DELETE /notes/{id} | non-existing (missing from the report's table) | 404 | pass |

¹ In AWS, a request without a token is rejected by API Gateway before Lambda. Locally these rows are exercised at the Lambda boundary (event without authorizer claims) and over HTTP against the Local Demo server. The real gateway behaviour is covered only by the live script.

### Authentication tests — declared verification level

| Scenario | Local (mocked event) | Real API Gateway |
|---|---|---|
| Missing authentication | pass — Lambda returns 401 if claims are absent | live script T02/T05 — not run |
| Valid authenticated request | pass | live script T01… — not run |
| ID token instead of access token | pass — `token_use=id` rejected by Lambda | live A03 — not run |
| Missing required scope | pass — Lambda `require_scope` | live A06/A07 (needs `EnableScopeTestClient=true`) — not run |
| Invalid/garbage token, tampered signature | cannot be tested locally (Lambda never sees raw tokens) | live A01/A02 — not run |
| Expired token | cannot be tested locally | manual: wait 60 min, expect 401 — not run |
| Wrong issuer / wrong client | cannot be tested locally | needs a second user pool — not automated |

A mocked Lambda event proves how the function reacts to claims. It proves nothing about signature, issuer or expiry checking — those happen in API Gateway.

### Authorization and security regression (`backend/tests/security/test_isolation.py`)

User B cannot GET/PUT/DELETE user A's note (403, no content or owner in the body, note unchanged) · a correct `version` does not help a non-owner · lists contain only the caller's notes · `userId`, `owner`, `sub`, `noteId`, `createdAt` in the body are rejected · owner comes only from claims (not query/header) · update cannot transfer ownership · another user's pagination token exposes nothing · ID-token and scope boundaries · logs contain no title/content/token · hostile strings are stored inert · 500 responses leak no internals · 16 concurrent writers: non-owners all 403, exactly one owner update wins, the rest 409.

### Frontend

Unit/component (66): API client (auth header, envelope parsing, network failure, 401 refresh-and-retry, session expiry, explorer mode never exposing credentials), PKCE RFC 7636 test vector, config validation, Cognito sign-up error mapping, token exchange, state mismatch, tokens never in storage, refresh, demo identities, sign-in routing, registration form (policy, mismatch, verification, resend path), password reset (request, policy check, expired code, completion), dashboard (loading/empty/data/error+retry/partial data), notes list (delete dialog focus and confirmation, failed delete, load more, search scope), editor (validation, create, version on save, Ctrl+S, 409, server field errors, 403/404, 500 with request id), settings, architecture explorer, 404.

End-to-end (14, real browser → Vite → Local Demo backend): demo labelling and protected-route redirect with return-to; create → open → edit → reload (persistence) → delete; validation; user isolation including identity switch; pagination with 23 notes; unsaved-changes guard; API explorer 200 and 401; architecture explorer by keyboard; no horizontal overflow at 375/768/1280/1920 px on six pages plus mobile navigation; **automated accessibility audit** (`tests/e2e/accessibility.spec.ts`, axe-core, WCAG 2.0/2.1/2.2 A and AA rule sets) in light and dark theme on sign-in, dashboard, notes list and cards, delete dialog, editor (also with a validation error), architecture explorer, API explorer, settings and the mobile navigation drawer — zero violations. The audit found and led to one fix: the account button's accessible name did not contain its visible text.

Screenshots (`npm run screenshots`) are in `evidence/screenshots/` and were reviewed by eye once.

## Running the tests

```bash
make setup                 # once
make test-backend          # pytest + coverage
make test-frontend         # vitest
make test-e2e              # Playwright (starts backend + Vite itself; CI: npx playwright install chromium first)
make lint typecheck build  # static checks and production build
make validate              # cfn-lint + sam validate (pip install cfn-lint aws-sam-cli)
make audit                 # pip-audit + npm audit
```
Single test: `cd backend && .venv/bin/pytest tests/security -k isolation -v`.

Test data: every backend test creates a fresh in-memory table (fixture `table` in `tests/conftest.py`); users are the constants `ALICE` and `BOB`. E2E tests call `POST /__demo/reset` before each test.

## Acceptance scenarios (section 29 of the brief)

| ID | Scenario | Method | Environment | Expected | Actual | Status | Evidence |
|---|---|---|---|---|---|---|---|
| A | New account: register, verify, sign in | component test (mocked) + real browser against AWS | jsdom; AWS | account created, code sent, hosted sign-in, dashboard | as expected; the e-mailed code itself was not read (simulator mailbox, operator confirmation) | **Pass (AWS)**, code entry not verified | `pages.test.tsx`; AWS browser test below |
| B | Create note → 201 | pytest + Playwright | moto / Local Demo | 201, stored | 201 | **Pass (local)** | `test_thesis_table_01`, e2e "create, open, edit…" |
| C | Read created note | same | same | same content | same | **Pass (local)** | `test_thesis_table_06`, e2e |
| D | Update; `updatedAt` changes | same | same | 200, newer `updatedAt`, version+1 | as expected | **Pass (local)** | `test_thesis_table_09` |
| E | Delete; then 404 | same | same | 200 then 404 | as expected | **Pass (local)** | `test_thesis_table_12` |
| F | Unauthorized visitor | pytest, e2e, live A01–A04, T02, T05 | local; AWS | rejected | 401 (403 for a tampered signature) | **Pass (local and AWS)** | `test_unknown_or_missing_identity`; `live-api-tests.json` |
| G | Invalid input | pytest + e2e | local | 400, no crash | 400 | **Pass (local)** | `test_bad_bodies_return_400` |
| H | User isolation | pytest security + e2e; live T07/T10/T13/H01/H02; browser with two real users | local; AWS | all rejected, data unchanged | 403, unchanged | **Pass (local and AWS)** | `test_isolation.py`; `live-api-tests.json`; `aws-11-isolation-forbidden.png` |
| I | Restart: notes persist in AWS mode | browser: full page reload in AWS mode | AWS | notes still there | the note was listed again after reload and after signing out and in | **Pass (AWS)** | AWS browser test below |
| J | Production build | `npm run build` | local | no TS errors | passes | **Pass** | `evidence/builds/frontend-build.txt` |
| K | Infrastructure validation | cfn-lint, sam validate, sam build | local | valid | valid | **Pass** | `evidence/builds/infrastructure-validation.txt` |
| L | Automated tests run | pytest, vitest, Playwright, live suite | local; AWS | pass | 187 + 66 + 14 passed; 38/38 live | **Pass** | `evidence/tests/` |

## Live AWS tests (2026-11-17, eu-north-1)

Stack `serverless-notes-dev`, deployed from this repository; run with `make live-test` (see `docs/deployment/DEPLOYMENT.md` for credentials). The script creates two throw-away Cognito users, obtains real access tokens through the hosted login (Authorization Code + PKCE), runs the checks below, deletes everything it created and writes `evidence/tests/live-api-tests.json`. Final run: **38 passed, 0 failed** (executed 2026-11-17T13:45:26+00:00).

| ID | Check | Expected | Actual | Result |
|---|---|---|---|---|
| T01 | POST valid token + body | 201 | 201 | PASS |
| T02 | POST missing token | 401 | 401 | PASS |
| T03 | POST missing title | 400 | 400 | PASS |
| T04 | GET list | 200 | 200 | PASS |
| T04b | list contains only caller's notes | True | True | PASS |
| T05 | GET list missing token | 401 | 401 | PASS |
| T06 | GET own note | 200 | 200 | PASS |
| T07 | GET other user's note | 403 | 403 | PASS |
| T08 | GET missing note | 404 | 404 | PASS |
| T09 | PUT own note | 200 | 200 | PASS |
| T10 | PUT other user's note | 403 | 403 | PASS |
| T11 | PUT missing note | 404 | 404 | PASS |
| T13 | DELETE other user's note | 403 | 403 | PASS |
| H01 | note unchanged by other user's attempts | Updated | Updated | PASS |
| H02 | other user's list does not contain the note | True | True | PASS |
| A01 | garbage bearer token | 401 | 401 | PASS |
| A02 | tampered signature | 401 / 403 | 403 | PASS |
| A03 | ID token instead of access token | 401 / 403 | 401 | PASS |
| A04 | non-Bearer scheme | 401 | 401 | PASS |
| A05 | unknown route with token | 403 / BAD_REQUEST | 403 / BAD_REQUEST | PASS |
| A06 | read-only token can list | 200 | 200 | PASS |
| A07 | read-only token cannot create (missing scope) | 401 / 403 | 401 | PASS |
| R01 | unknown route without token | 404 / NOT_FOUND | 404 / NOT_FOUND | PASS |
| R02 | unsupported method with token | 403 / BAD_REQUEST | 403 / BAD_REQUEST | PASS |
| V01 | client-supplied userId rejected | 400 / VALIDATION_ERROR | 400 / VALIDATION_ERROR | PASS |
| V02 | malformed JSON | 400 | 400 | PASS |
| V03 | invalid note id | 400 | 400 | PASS |
| V04 | body over 128 KB | 413 | 413 | PASS |
| C01 | preflight allows the configured origin | 200 / http://localhost:5173 | 200 / http://localhost:5173 | PASS |
| C02 | preflight allows Authorization header | True | True | PASS |
| C03 | CORS header on a successful response | http://localhost:5173 | http://localhost:5173 | PASS |
| C04 | CORS header on a gateway 401 | http://localhost:5173 | http://localhost:5173 | PASS |
| T12 | DELETE own note | 200 | 200 | PASS |
| T14 | GET after delete | 404 | 404 | PASS |
| T15 | DELETE missing note | 404 | 404 | PASS |
| L01 | burst above the stage limit is throttled (429 present) | True | True | PASS |
| L02 | burst produces only 200/429 | True | True | PASS |
| L03 | 429 uses the error envelope | THROTTLED | THROTTLED | PASS |

How the run evolved (all recorded in `docs/deployment/TROUBLESHOOTING.md`): the first run passed 24 of 25 checks — A02 expected 401 but API Gateway answers 403 for a well-formed token with a bad signature, which is still a rejection, so the expectation was corrected. The extended run exposed that an unknown route *with* an `Authorization` header returns 403 `BAD_REQUEST` (it has no gateway response type of its own; measured, documented in `docs/api/API.md`), and that throttling is best-effort (below).

### Browser test of the AWS mode (2026-11-17)

The React app (`npm run dev:aws`, configuration from `make frontend-env`) driven through Playwright against the deployed stack:

| Step | Result |
|---|---|
| Register in the app (`SignUp`) with an SES mailbox-simulator address | account created; "We sent a verification code to s***@s***" |
| Enter a wrong code | "That verification code is not correct" (Cognito 400) |
| Enter the right code | **not verified**: the simulator mailbox cannot be read; the operator confirmed the account with `admin-confirm-sign-up` |
| Sign in | redirect to the Cognito hosted page with `code_challenge_method=S256`, `state` and the four scopes; back on the dashboard after the password |
| Create, edit (version 1 → 2), list, delete a note | 201, 200, 200, 200 in the network log |
| Full page reload | session restored by the silent hosted-login redirect; note still listed |
| Sign out, sign in as a second user | hosted page asks for a password again (hosted session cleared) |
| Second user opens the first user's note URL | "This note belongs to another account" with `FORBIDDEN` and the request id (`evidence/screenshots/aws-11-isolation-forbidden.png`) |
| Token storage | no token in `localStorage`, `sessionStorage` (only a one-character "was signed in" flag), cookies of the app origin or the DOM |
| Console | only the deliberate wrong-code 400 and a 404 for Cognito's own hosted-page favicon |

### Hosted frontend on CloudFront (2026-11-17)

Public URL https://d11c0a7q5fx9qi.cloudfront.net; raw output in `evidence/tests/frontend-hosting-http-checks.txt`.

| Check | Result |
|---|---|
| `GET /` | 200, `Cache-Control: no-cache`, HSTS, header CSP with `frame-ancestors 'none'`, `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`, COOP |
| `http://…/notes` | 301 to `https://…/notes` |
| Deep links `/notes`, `/notes/<id>`, `/auth/callback`, `/settings`, unknown path | 200 `text/html` (the SPA) |
| Hashed bundle | `Cache-Control: public, max-age=31536000, immutable`, Brotli |
| Direct S3 URLs (regional, global) | 403 |
| API preflight and gateway 401 with `Origin: <site>` | `Access-Control-Allow-Origin: <site>` |
| Live suite with `--origin <site> --redirect-uri <site>/auth/callback` | 38/38 (the hosted login accepted the CloudFront callback URL) |
| Browser (Playwright, Chromium) on the public URL | `/notes` → sign-in page → Cognito hosted login (PKCE, CloudFront `redirect_uri`) → back on `/notes`; create, full reload of `/notes/<id>` restores the session, edit, delete; no token in storage or cookies; sign-out returns to the site and `/notes` requires sign-in again; console: no CSP violations (only Cognito's favicon 404 and 429s left over from the suite's throttle burst) |
| Local development | `npm run dev:aws`: `http://localhost:5173/api/notes` proxied to API Gateway → 401 envelope (`evidence/tests/frontend-dev-proxy-check.txt`) |

Not repeated: the second-user isolation check in the browser (covered by the live suite's cross-user tests on the same stack) and the benchmark (the API path is unchanged).

### AWS benchmark (2026-11-17)

`scripts/testing/benchmark.py`, 100 sequential cycles (POST → list → GET → PUT → DELETE) with a 100 ms pause, from a client in Central Europe; a new TLS connection per request; the first cycle hit five cold starts because the functions had just been deployed. All values in milliseconds, end to end as the client sees them:

| Endpoint | n | Median | p95 | Max | Success |
|---|---|---|---|---|---|
| POST /notes | 100 | 121.05 | 141.6 | 807.63 | 100% |
| GET /notes | 100 | 119.41 | 149.27 | 949.14 | 100% |
| GET /notes/{id} | 100 | 118.8 | 145.82 | 768.55 | 100% |
| PUT /notes/{id} | 100 | 121.69 | 152.32 | 908.41 | 100% |
| DELETE /notes/{id} | 100 | 122.13 | 149.63 | 745.91 | 100% |

Details and the cold-start analysis: `docs/performance/PERFORMANCE.md`.

## Not verified

- Receiving and entering the e-mailed verification code (the run used the SES mailbox simulator; the account was confirmed by the operator), password reset and the "send a new code" path against real Cognito.
- Expired tokens (60-minute lifetime) and tokens from another user pool (wrong issuer) — not automated.
- Alarm notifications (no `AlarmEmail` configured); no alarm has been in `ALARM` state.
- `scripts/cleanup/destroy.sh`, `scripts/cleanup/destroy_hosting.sh` and `.github/workflows/deploy.yml` (both jobs) have not been executed (the GitHub OIDC roles are not set up).
- Concurrent load beyond the throttle bursts; long-running stability; the real monthly bill.
- Browsers other than Chromium; manual screen-reader testing. The axe audit covers the Local Demo screens only.

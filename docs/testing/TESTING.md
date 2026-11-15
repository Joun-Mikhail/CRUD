# Testing

All results below were produced on 2026-11-15 in a Linux container (Python 3.13.18, Node 22). Raw outputs are stored in [`evidence/`](../../evidence). Nothing here was run against AWS.

## Summary of executed checks

| Check | Command | Result | Evidence |
|---|---|---|---|
| Backend tests | `cd backend && .venv/bin/pytest --cov` | **166 passed**, 0 failed | `evidence/tests/backend-pytest.txt` |
| Backend coverage | (same) | **98.99 %** line+branch of `src/notes_api` (586 statements, 3 missed); gate 85 % | same |
| Backend lint/format/types | `ruff check .`, `ruff format --check .`, `mypy` (strict) | no findings | `evidence/tests/backend-static-analysis.txt` |
| Backend dependency audit | `pip-audit` | no known vulnerabilities | same |
| Frontend unit/component tests | `cd frontend && npm test` | **63 passed** (4 files) | `evidence/tests/frontend-vitest.txt` |
| Frontend lint/types | `npm run lint`, `npm run typecheck` | no findings | `evidence/tests/frontend-static-analysis.txt` |
| Frontend dependency audit | `npm audit --omit=dev` | 0 vulnerabilities | same |
| Browser end-to-end | `npm run test:e2e -- --trace off` | **12 passed** (Chromium, Local Demo) | `evidence/tests/frontend-e2e-playwright.txt` |
| Production build | `npm run build` | passes; JS 131.9 kB gzip | `evidence/builds/frontend-build.txt` |
| Production build smoke | built app served by `vite preview`, driven by Playwright through 6 pages | no console/CSP errors | (manual run, not stored) |
| Infrastructure | `cfn-lint`, `sam validate --lint`, `sam build` | no findings; valid; build succeeded | `evidence/builds/infrastructure-validation.txt` |
| OpenAPI | `openapi-spec-validator docs/api/openapi.yaml` | OK | — |
| Latency benchmark (local only) | `scripts/testing/benchmark.py`, 100 cycles | 100 % success | `evidence/benchmarks/local-demo-benchmark.json` |
| CI on GitHub Actions | `.github/workflows/ci.yml` on pull request #1 | all 4 jobs green (backend, frontend, browser e2e, infrastructure) | PR #1 checks |
| **Live AWS tests** | `scripts/testing/live_api_tests.py` | **NOT RUN** — no usable AWS credentials | — |

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
scripts/testing/live_api_tests.py   real AWS (not run)     real JWT validation, real Cognito, IAM
```

`moto` emulates DynamoDB. It is faithful for the calls used here (conditional writes, `ReturnValuesOnConditionCheckFailure`, GSI queries, pagination) but it is not DynamoDB; GSI eventual consistency, throttling and real latencies are not reproduced.

### Thesis test table (semestral report, 13 rows)

Each row is one test named `test_thesis_table_NN_…` in `backend/tests/integration/test_api_flow.py`:

| # | Request | Condition | Expected | Local result |
|---|---|---|---|---|
| 1 | POST /notes | valid token, valid body | 201 | pass |
| 2 | POST /notes | missing token | 401 | pass¹ |
| 3 | POST /notes | missing title | 400 | pass |
| 4 | GET /notes | valid token | 200 | pass |
| 5 | GET /notes | missing token | 401 | pass¹ |
| 6 | GET /notes/{id} | own note | 200 | pass |
| 7 | GET /notes/{id} | other user's note | 403 | pass |
| 8 | GET /notes/{id} | non-existing | 404 | pass |
| 9 | PUT /notes/{id} | own note, valid body | 200 | pass |
| 10 | PUT /notes/{id} | other user's note | 403 | pass |
| 11 | PUT /notes/{id} | non-existing | 404 | pass |
| 12 | DELETE /notes/{id} | own note | 200 | pass |
| 13 | DELETE /notes/{id} | other user's note | 403 | pass |
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

Unit/component (63): API client (auth header, envelope parsing, network failure, 401 refresh-and-retry, session expiry, explorer mode never exposing credentials), PKCE RFC 7636 test vector, config validation, Cognito sign-up error mapping, token exchange, state mismatch, tokens never in storage, refresh, demo identities, sign-in routing, registration form (policy, mismatch, verification, resend path), dashboard (loading/empty/data/error+retry/partial data), notes list (delete dialog focus and confirmation, failed delete, load more, search scope), editor (validation, create, version on save, Ctrl+S, 409, server field errors, 403/404, 500 with request id), settings, architecture explorer, 404.

End-to-end (12, real browser → Vite → Local Demo backend): demo labelling and protected-route redirect with return-to; create → open → edit → reload (persistence) → delete; validation; user isolation including identity switch; pagination with 23 notes; unsaved-changes guard; API explorer 200 and 401; architecture explorer by keyboard; no horizontal overflow at 375/768/1280/1920 px on six pages plus mobile navigation.

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
| A | New account: register, verify, sign in | component test with mocked Cognito | jsdom | reaches hosted sign-in redirect | as expected | **Pass (mocked)** / **Not run on AWS** | `pages.test.tsx` "registers, verifies…" |
| B | Create note → 201 | pytest + Playwright | moto / Local Demo | 201, stored | 201 | **Pass (local)** | `test_thesis_table_01`, e2e "create, open, edit…" |
| C | Read created note | same | same | same content | same | **Pass (local)** | `test_thesis_table_06`, e2e |
| D | Update; `updatedAt` changes | same | same | 200, newer `updatedAt`, version+1 | as expected | **Pass (local)** | `test_thesis_table_09` |
| E | Delete; then 404 | same | same | 200 then 404 | as expected | **Pass (local)** | `test_thesis_table_12` |
| F | Unauthorized visitor | pytest (Lambda boundary, Local Demo HTTP), e2e explorer | local | rejected (401) | 401 | **Pass (local)**; real gateway **Not run** | `test_unknown_or_missing_identity` |
| G | Invalid input | pytest + e2e | local | 400, no crash | 400 | **Pass (local)** | `test_bad_bodies_return_400` |
| H | User isolation | pytest security + e2e | local | all rejected, data unchanged | 403, unchanged | **Pass (local)**; AWS **Not run** | `test_isolation.py`, e2e "users are isolated" |
| I | Restart: notes persist in AWS mode | — | AWS | notes still there | — | **Not run** (Local Demo is in-memory by design) | — |
| J | Production build | `npm run build` | local | no TS errors | passes | **Pass** | `evidence/builds/frontend-build.txt` |
| K | Infrastructure validation | cfn-lint, sam validate, sam build | local | valid | valid | **Pass** | `evidence/builds/infrastructure-validation.txt` |
| L | Automated tests run | pytest, vitest, Playwright | local | pass | 166 + 63 + 12 passed | **Pass** | `evidence/tests/` |

## Not verified

- Anything on real AWS: deployment, Cognito e-mail delivery and hosted login, API Gateway token validation and gateway responses (in particular which status the authorizer returns for an insufficient scope, and that an unknown route maps to 404), IAM policies, alarms, CloudWatch log output, CORS preflight from the browser, throttling (429).
- `scripts/testing/live_api_tests.py`, `scripts/deployment/*.sh|py`, `scripts/cleanup/destroy.sh` and `.github/workflows/deploy.yml` have never been executed (syntax-checked only).
- AWS-mode UI in a real browser (only component tests with mocked Cognito).
- Browsers other than Chromium; screen readers; automated WCAG audit (axe) — accessibility was implemented and spot-checked through roles/labels in tests, not formally audited.
- Performance on AWS (see `docs/performance/PERFORMANCE.md`).

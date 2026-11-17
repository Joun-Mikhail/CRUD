# Project completion report

Date: 2026-11-17 (AWS deployment and tests added) · first version 2026-11-15

## Executive summary

Serverless Notes is a multi-user private notes application that demonstrates a secure serverless CRUD API on AWS, built for the thesis *Serverless CRUD API with Authentication*.

**Delivered and verified locally:** the complete Python backend (five Lambda handlers with validation, ownership enforcement, pagination, optimistic locking, structured logging), a SAM template for the whole AWS stack, a React web client with two clearly separated modes, automated tests at every level, CI, and full documentation including a learning package.

**Deployed and verified on AWS (2026-11-17):** the development stack `serverless-notes-dev` in eu-north-1. The live suite passed 38/38 checks (thesis table, authentication, scopes, isolation, routing, validation, CORS, throttling); the React app worked against real Cognito and the real API in a browser; CloudWatch logs, Logs Insights and alarm metrics were checked; a bounded benchmark measured latency and cold starts.

**Public site:** https://d11c0a7q5fx9qi.cloudfront.net (S3 + CloudFront, 2026-11-17). Registration with a real mailbox, password reset and CRUD were checked manually by the project owner on 2026-11-17.

**Bachelor-stage evaluation (2026-11-17):** concurrency benchmark up to 8 clients / 60 req/s (100 % success, median 120–126 ms), per-method throttle measured, negative-token tests 9/9 (immediate checks) (incl. a real expired token: pending (expected 401)), security/monitoring/cost evaluations, Cost Explorer reconciliation (payable USD 0; gross usage from an unrelated EC2 instance). Draft: `docs/thesis/BACHELOR_THESIS_DRAFT.md`.

**Still open:** alarm notifications (no `AlarmEmail`), the GitHub deploy workflow, the thesis services' share of the real bill (not yet in Cost Explorer), load above ≈ 60 req/s.

## Architecture summary

Browser (React) → Amazon Cognito (sign-up, hosted sign-in, Authorization Code + PKCE) → API Gateway REST API with Cognito user-pool authorizer and OAuth scopes → five AWS Lambda functions (Python 3.13, arm64) → Amazon DynamoDB (partition key `noteId`, GSI `byUser`) · Amazon CloudWatch (logs, 4 alarms) · AWS SAM/CloudFormation in `eu-north-1` (ADR 0008) · GitHub Actions.

## Functional completion

| Requirement | Code | Verified locally | Verified on AWS |
|---|---|---|---|
| FR-001 Registration (Cognito sign-up, password policy, verification) and password reset | yes | component tests with mocked Cognito | sign-up and wrong-code handling yes (automated); e-mailed code and password reset: manual owner check only |
| FR-002 Login (PKCE, in-memory tokens, refresh, expiry, logout) | yes | unit tests with mocked Cognito | yes (hosted sign-in with PKCE, session restore after reload, sign-out); expiry not observed |
| FR-003 Create note | yes | yes | yes |
| FR-004 List notes (index query, pagination, ordering) | yes | yes | yes (pagination not exercised on AWS) |
| FR-005 Get note (UUID validation, 403/404) | yes | yes | yes |
| FR-006 Update note (atomic ownership, version) | yes | yes | yes |
| FR-007 Delete note | yes | yes | yes |
| FR-008 User isolation (every method, list, pagination, concurrency) | yes | yes | yes (API and browser) |
| FR-009 Error management (uniform envelope, request ids, no leakage) | yes | yes | yes, incl. gateway responses (exceptions documented in `docs/api/API.md`) |
| FR-010 Logging and monitoring | yes | logging yes | yes (CloudWatch logs, Logs Insights, alarm metrics; no alarm fired) |
| REST contract: 5 endpoints, 201/200/400/401/403/404 (+409/413/415/429/503) | yes | yes | yes except 409 and 503 (not provoked live) |
| Infrastructure as code | yes | cfn-lint, `sam validate`, `sam build`, template tests | **deployed** (eu-north-1) |
| Frontend (all 7 page types, both modes) | yes | Local Demo: unit + browser tests | AWS mode: browser test against the deployed stack |
| Local Demo mode | yes | yes | n/a |
| CI | yes | green on GitHub (PR #1) | n/a |
| Deploy workflow (OIDC, manual) | yes | syntax only | no (OIDC role not set up) |

## Test results (actually executed; local runs repeated 2026-11-17)

| Command | Outcome |
|---|---|
| `cd backend && .venv/bin/pytest --cov` | 193 passed; coverage 99.01 % (2026-11-17) |
| `ruff check .` · `ruff format --check .` · `mypy` | clean |
| `pip-audit` | no known vulnerabilities |
| `cd frontend && npm test` | 66 passed |
| `npm run lint` · `npm run typecheck` | clean |
| `npm audit --omit=dev` | 0 vulnerabilities |
| `npm run test:e2e -- --trace off` | 14 passed (Chromium, Local Demo), including the axe accessibility audit with zero violations |
| `npm run build` | passes (JS 131.9 kB gzip); built app smoke-tested under its CSP with no console errors |
| `cfn-lint infrastructure/template.yaml` | no findings |
| `sam validate` (SAM transform) · `sam validate --lint` · `sam build` | valid · valid · build succeeded |
| `openapi-spec-validator docs/api/openapi.yaml` | OK |
| GitHub Actions CI on PR #1 | backend, frontend, e2e, infrastructure — all successful |
| `scripts/testing/benchmark.py` against Local Demo, 100 cycles | 100 % success; medians 2.4–4.4 ms — **emulator on one machine, not AWS** |
| `sam deploy` (reviewed change set, eu-north-1) | `CREATE_COMPLETE`, 33 resources, no failures |
| `scripts/testing/live_api_tests.py` (real AWS) | **38 passed, 0 failed** |
| Browser test of the AWS mode (Playwright, real Cognito) | sign-up, sign-in, CRUD, reload, isolation, sign-out pass; e-mailed code not read |
| `scripts/testing/benchmark.py` against AWS, 100 cycles | 500/500 succeeded; median ≈ 120 ms end to end; cold start ≈ 0.75–0.95 s end to end |

Raw outputs: `evidence/`. Acceptance scenarios A–L with status: `docs/testing/TESTING.md` (all pass; A passes on AWS except entering the e-mailed code).

## Security review

Approach: identity only from claims verified by API Gateway; unknown request fields rejected; ownership compared on read and embedded in the DynamoDB condition on write (atomic); pagination tokens carry no user id; one IAM action per function; generic 500s; logs free of content and credentials; tokens in browser memory only; PKCE + state; strict CSP.

Verified by tests (local): cross-user GET/PUT/DELETE rejected with no disclosure or side effect; owner cannot be set or transferred; lists and pagination isolated; ID tokens and missing scopes refused at the Lambda layer; concurrent writers cannot bypass ownership or versions; logs and error bodies leak nothing.

Verified on AWS: JWT validation, scopes, isolation, IAM (one action per function), CORS, throttling, log hygiene, token storage in the browser.

Remaining risks: the stage throttle is approximate and can lock one method for minutes after a burst; no MFA; stage-level rather than per-user throttling; sign-up reveals registered e-mails; 403-vs-404 reveals existence of a guessed UUID (thesis requirement); unsigned pagination token; access tokens valid until expiry after sign-out. No critical or high-severity finding is known in the application logic; no penetration test was performed. Full list: `docs/security/SECURITY.md`.

## AWS deployment status

Deployed on 2026-11-17 to eu-north-1 (stack `serverless-notes-dev`, development stage). The first change set exposed a template error that offline validation had missed (`AuthorizationScopes` without an explicit `Authorizer`; CI only ran cfn-lint); it was fixed and CI now runs the SAM transform too. Later updates added nothing but the cold-start fix. Every problem met is recorded in `docs/deployment/TROUBLESHOOTING.md`. `scripts/cleanup/destroy.sh` and the GitHub deploy workflow have not been executed.

## Frontend status

Built, launched and tested in Local Demo mode in a real browser (14 tests, four viewport widths, light and dark theme); screenshots in `evidence/screenshots/`. Production build passes. AWS mode was tested in a real browser against the deployed stack on 2026-11-17: registration, hosted sign-in with PKCE, CRUD, reload, cross-user access (refused with a clear message), sign-out; tokens stay in memory. Token refresh after expiry was not observed.

## Repository navigation — most important files

| File | Role |
|---|---|
| `backend/src/notes_api/operations.py` | the five operations |
| `backend/src/notes_api/http.py` | Lambda handler wrapper: identity, envelope, errors, logging |
| `backend/src/notes_api/services/notes_service.py` | business rules, 403/404/409 semantics |
| `backend/src/notes_api/repositories/notes_repository.py` | DynamoDB access and conditional writes |
| `backend/src/notes_api/validation/notes.py` | input rules |
| `backend/src/notes_api/security/identity.py` | trusted identity extraction |
| `backend/local_demo/server.py` | Local Demo server |
| `backend/tests/integration/test_api_flow.py` | thesis test table |
| `backend/tests/security/test_isolation.py` | isolation and security regression |
| `infrastructure/template.yaml` | all AWS resources |
| `frontend/src/services/apiClient.ts`, `services/auth/cognitoAuth.ts` | API client; PKCE and token handling |
| `scripts/testing/live_api_tests.py` | live acceptance tests (38 checks, run on AWS) |

## Remaining limitations

1. Not verified on AWS by an automated test: e-mailed code and password reset (manual owner check only), a token from a second real user pool, alarm notifications, pagination, 409/503 paths.
2. Cost analysis uses Stockholm list prices from the AWS Price List API; no real bill yet.
3. Gateway behaviour that the template cannot change: unknown route with an `Authorization` header → 403 `BAD_REQUEST`; >10 MB bodies → plain-text 413; approximate throttling (see `docs/performance/PERFORMANCE.md`).
4. `destroy.sh` and the GitHub deploy workflow unexecuted.
5. No frontend hosting; no account-deletion screen; no server-side search.
6. No MFA, WAF or per-user rate limits; `dev` stage has no backups.
7. Chromium only. An automated axe audit (WCAG A/AA rule sets, both themes) passes with zero violations; no manual screen-reader review.
8. Expired-token and foreign-issuer cases are not automated.
9. Performance measured with one sequential client only; scalability remains a theoretical evaluation.
10. The semestral report's text and figures contain errors listed in `docs/REQUIREMENTS.md` §4 that only the author can correct.

## Academic learning roadmap

1. `START_HERE.md`, run the Local Demo, read the eight files in the listed order.
2. Lessons 1–12 in `docs/learning/`, doing every exercise.
3. Rebuild the backend from an empty folder using the two-week plan in `docs/learning/README.md`, using the existing tests as the acceptance check.
4. Read `docs/deployment/TROUBLESHOOTING.md` ("First deployment") — what the real deployment revealed and why; rerun `make live-test` yourself.
5. Register once with your own mailbox; look at the measured latency and cold starts in `docs/performance/PERFORMANCE.md` and be ready to explain them.
6. Rehearse `SUPERVISOR_QUESTIONS.md`. Declare AI assistance according to your faculty's rules.

## Demonstration guide (about 10 minutes)

Without AWS (always works):
1. `make demo-backend` and `make demo-frontend`; open `http://localhost:5173`. Point out the "Local Demo" banner and say what is simulated.
2. **Architecture** page: run the walkthrough of `POST /notes`; click API Gateway and DynamoDB.
3. Sign in as Alice → **New note** → save. Show the backend terminal: one JSON log line with request id, status 201, duration.
4. Edit the note; show `version` and `updatedAt` change under the editor.
5. **API explorer**: `GET /notes` → 200 with timing; tick "Send without the Authorization header" → 401 with the error envelope.
6. Copy the note id. **Settings → switch to Bob**. Notes list no longer contains it. In the API explorer `GET /notes/{id}` with Alice's id → 403; `DELETE` → 403. Switch back to Alice: the note is intact.
7. Invalid input: API explorer `POST /notes` with `{"title": 5}` → 400 with `details`.
8. Terminal: `make test-backend` (187 passing; point at `tests/security`), open `infrastructure/template.yaml` and show one function's single-action IAM policy and the authorizer scopes.

With AWS (the stack is deployed): `make frontend-env`, `cd frontend && npm run dev:aws`; repeat steps 3–7 with two real accounts, show the Cognito hosted sign-in, the CloudWatch log entry found by request id (Logs Insights query in `docs/deployment/TROUBLESHOOTING.md`) and the `make live-test` output.

## Professional quality assessment

Evidence-based, not a percentage:

- **Correctness of application logic — strong.** Every endpoint, error path and ownership rule is exercised by tests against an emulated DynamoDB, including concurrency; strict typing and linting are clean; CI reproduces the results on GitHub.
- **Security design — sound for the scope**, with the central rule (ownership) enforced atomically in the database; the platform controls were observed working on AWS.
- **Infrastructure — deployed and working.** The first real deployment did surface one issue the validators had missed; it is fixed and CI now catches that class of error.
- **Frontend — complete in both modes**; AWS mode verified in a real browser except the e-mail code entry and token expiry.
- **Documentation — comprehensive and consistent with the code**, with unverified claims labelled.
- **Overall:** a deployed, tested development stack of a well-tested implementation. It is not production-ready (no MFA, WAF, per-user limits, backups in `dev`, frontend hosting), and the open items above are listed in `PROJECT_STATE.md`.

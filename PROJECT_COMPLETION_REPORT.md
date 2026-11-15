# Project completion report

Date: 2026-11-15 · Branch: `claude/serverless-notes-build-h3po79` · Pull request: #1 (draft)

## Executive summary

Serverless Notes is a multi-user private notes application that demonstrates a secure serverless CRUD API on AWS, built for the thesis *Serverless CRUD API with Authentication*.

**Delivered and verified locally:** the complete Python backend (five Lambda handlers with validation, ownership enforcement, pagination, optimistic locking, structured logging), a SAM template for the whole AWS stack, a React web client with two clearly separated modes, automated tests at every level, CI, and full documentation including a learning package.

**Not delivered:** a verified AWS deployment. No usable AWS credentials were available, so the stack was never deployed and nothing that depends on real AWS services has been observed working.

> **AWS DEPLOYMENT: NOT VERIFIED — NO AUTHORIZED CLOUD ENVIRONMENT**

The project is therefore **not 100 % complete** against the brief: the code and infrastructure definition are complete; the live verification and AWS measurements are open.

## Architecture summary

Browser (React) → Amazon Cognito (sign-up, hosted sign-in, Authorization Code + PKCE) → API Gateway REST API with Cognito user-pool authorizer and OAuth scopes → five AWS Lambda functions (Python 3.13, arm64) → Amazon DynamoDB (partition key `noteId`, GSI `byUser`) · Amazon CloudWatch (logs, 4 alarms) · AWS SAM/CloudFormation in `eu-central-1` · GitHub Actions.

## Functional completion

| Requirement | Code | Verified locally | Verified on AWS |
|---|---|---|---|
| FR-001 Registration (Cognito sign-up, password policy, verification) | yes | component tests with mocked Cognito | **no** |
| FR-002 Login (PKCE, in-memory tokens, refresh, expiry, logout) | yes | unit tests with mocked Cognito | **no** |
| FR-003 Create note | yes | yes | no |
| FR-004 List notes (index query, pagination, ordering) | yes | yes | no |
| FR-005 Get note (UUID validation, 403/404) | yes | yes | no |
| FR-006 Update note (atomic ownership, version) | yes | yes | no |
| FR-007 Delete note | yes | yes | no |
| FR-008 User isolation (every method, list, pagination, concurrency) | yes | yes | no |
| FR-009 Error management (uniform envelope, request ids, no leakage) | yes | yes (Lambda); gateway responses unverified | no |
| FR-010 Logging and monitoring | yes | logging yes; alarms template-validated only | no |
| REST contract: 5 endpoints, 201/200/400/401/403/404 (+409/413/415/429/503) | yes | yes except gateway-generated responses | no |
| Infrastructure as code | yes | cfn-lint, `sam validate --lint`, `sam build` | **not deployed** |
| Frontend (all 7 page types, both modes) | yes | Local Demo: unit + browser tests; AWS mode: mocks only | no |
| Local Demo mode | yes | yes | n/a |
| CI | yes | green on GitHub (PR #1) | n/a |
| Deploy workflow (OIDC, manual) | yes | syntax only | no |

## Test results (actually executed, 2026-11-15)

| Command | Outcome |
|---|---|
| `cd backend && .venv/bin/pytest --cov` | 166 passed; coverage 98.99 % |
| `ruff check .` · `ruff format --check .` · `mypy` | clean |
| `pip-audit` | no known vulnerabilities |
| `cd frontend && npm test` | 63 passed |
| `npm run lint` · `npm run typecheck` | clean |
| `npm audit --omit=dev` | 0 vulnerabilities |
| `npm run test:e2e -- --trace off` | 12 passed (Chromium, Local Demo) |
| `npm run build` | passes (JS 131.9 kB gzip); built app smoke-tested under its CSP with no console errors |
| `cfn-lint infrastructure/template.yaml` | no findings |
| `sam validate --lint` · `sam build` | valid · build succeeded |
| `openapi-spec-validator docs/api/openapi.yaml` | OK |
| GitHub Actions CI on PR #1 | backend, frontend, e2e, infrastructure — all successful |
| `scripts/testing/benchmark.py` against Local Demo, 100 cycles | 100 % success; medians 2.4–4.4 ms — **emulator on one machine, not AWS** |
| `scripts/testing/live_api_tests.py` | **not run** |

Raw outputs: `evidence/`. Acceptance scenarios A–L with status: `docs/testing/TESTING.md` (B–H, J, K, L pass locally; A passes with mocked Cognito only; I — persistence across restarts in AWS mode — not run).

## Security review

Approach: identity only from claims verified by API Gateway; unknown request fields rejected; ownership compared on read and embedded in the DynamoDB condition on write (atomic); pagination tokens carry no user id; one IAM action per function; generic 500s; logs free of content and credentials; tokens in browser memory only; PKCE + state; strict CSP.

Verified by tests (local): cross-user GET/PUT/DELETE rejected with no disclosure or side effect; owner cannot be set or transferred; lists and pagination isolated; ID tokens and missing scopes refused at the Lambda layer; concurrent writers cannot bypass ownership or versions; logs and error bodies leak nothing.

Remaining risks: the platform controls (JWT validation, scopes, IAM, CORS, throttling) are configured but unobserved; no MFA; stage-level rather than per-user throttling; sign-up reveals registered e-mails; 403-vs-404 reveals existence of a guessed UUID (thesis requirement); unsigned pagination token; access tokens valid until expiry after sign-out. No critical or high-severity finding is known in the application logic; no penetration test was performed. Full list: `docs/security/SECURITY.md`.

## AWS deployment status

Not deployed. The credentials in the build environment were rejected by AWS STS. Prepared and statically validated: template, example configuration, deploy / frontend-env / live-test / destroy scripts, deploy workflow. None of the scripts has been executed against AWS; expect small corrections on first use (`docs/deployment/TROUBLESHOOTING.md` lists the likely ones).

## Frontend status

Built, launched and tested in Local Demo mode in a real browser (12 journeys, four viewport widths, light and dark theme); screenshots reviewed in `evidence/screenshots/`. Production build passes. AWS mode (Cognito registration, hosted sign-in with PKCE, token refresh, session expiry) is implemented and unit-tested against mocked Cognito responses, but has never talked to a real user pool.

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
| `scripts/testing/live_api_tests.py` | live acceptance tests (unexecuted) |

## Remaining limitations

1. No AWS deployment, live tests, CloudWatch evidence or AWS performance data.
2. Cost analysis: a later web check confirmed the Free Tier and Cognito allowances but not the Frankfurt-specific unit prices (see the verification table in `AWS_COST_ANALYSIS.md`); no real bill.
3. The pricing research and two documentation/frontend helper runs were interrupted by a usage limit; that work was finished directly, but without the online price check.
4. AWS-mode UI unverified against real Cognito; deploy/cleanup scripts and the deploy workflow unexecuted.
5. No frontend hosting; no password-reset/account-deletion screens; no server-side search.
6. No MFA, WAF or per-user rate limits; `dev` stage has no backups.
7. Chromium only; accessibility implemented (roles, labels, focus management, keyboard paths tested) but not formally audited.
8. Expired-token and foreign-issuer cases are not automated.
9. Performance and scalability evaluation is theoretical.
10. The semestral report's text and figures contain errors listed in `docs/REQUIREMENTS.md` §4 that only the author can correct.

## Academic learning roadmap

1. `START_HERE.md`, run the Local Demo, read the eight files in the listed order.
2. Lessons 1–12 in `docs/learning/`, doing every exercise.
3. Rebuild the backend from an empty folder using the two-week plan in `docs/learning/README.md`, using the existing tests as the acceptance check.
4. Deploy to your own AWS account; run `make live-test`; fix what the first deployment reveals and write it down.
5. Measure latency and cold starts; verify prices; replace the theoretical sections with your data.
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
8. Terminal: `make test-backend` (166 passing; point at `tests/security`), open `infrastructure/template.yaml` and show one function's single-action IAM policy and the authorizer scopes.

With AWS (after you have deployed): repeat steps 3–7 in AWS mode with two real accounts, show the Cognito hosted sign-in, the CloudWatch log entry found by request id, and the `make live-test` output.

## Professional quality assessment

Evidence-based, not a percentage:

- **Correctness of application logic — strong.** Every endpoint, error path and ownership rule is exercised by tests against an emulated DynamoDB, including concurrency; strict typing and linting are clean; CI reproduces the results on GitHub.
- **Security design — sound for the scope**, with the central rule (ownership) enforced atomically in the database and limits documented. Platform-level controls are configured but unproven.
- **Infrastructure — plausible but unproven.** It passes every offline validator; a first real deployment commonly surfaces issues validators cannot see.
- **Frontend — complete and polished in demo mode**, honest about its mode and data; AWS mode is the least-verified code in the repository.
- **Documentation — comprehensive and consistent with the code**, with unverified claims labelled.
- **Overall:** a deployment-ready, well-tested implementation whose remaining work is concentrated in one place — running it on AWS. It should not be described as production-ready or as verified on AWS until that has been done.

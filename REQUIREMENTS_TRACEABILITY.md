# Requirements traceability

Requirement identifiers are defined in [`docs/REQUIREMENTS.md`](docs/REQUIREMENTS.md). Status vocabulary:

- **Implemented and verified (local)** — code exists and automated tests passed against the in-memory emulator / in a real browser against the Local Demo.
- **Implemented and verified on AWS** — observed on the deployed development stack (`serverless-notes-dev`, eu-north-1) on 2026-11-17; evidence in `evidence/tests/live-api-tests.json`, `evidence/aws/` and `evidence/benchmarks/aws-dev-eu-north-1.json`.
- **Implemented, not verified** — code or configuration exists and passes static validation, but the behaviour was not observed on AWS.
- **Partially implemented**, **Not implemented**, **Blocked by external dependency**.

The stack was deployed to AWS (eu-north-1) on 2026-11-17 and tested there; rows say which parts were verified on AWS and which only locally.

Paths: `B/` = `backend/src/notes_api/`, `T/` = `backend/tests/`, `I` = `infrastructure/template.yaml`, `F/` = `frontend/`.

## Semestral thesis scope (assignment items 1–3)

| ID | Description | Implementation | Tests | Status | Evidence | Limitations |
|---|---|---|---|---|---|---|
| A-1 | Research of platforms, serverless, databases, auth | Thesis text (author's work); supporting material: `docs/architecture`, `docs/decisions`, `docs/learning` | — | Partially implemented (documentation support only) | — | The research chapter is the author's; this repository does not write it |
| A-2 | Design: entities, data model, endpoints, formats, access rules | `docs/api/API.md`, `docs/api/openapi.yaml`, `docs/database/DATABASE.md`, `docs/architecture/ARCHITECTURE.md` | OpenAPI validated | Implemented and verified (local) | — | "User roles": one role (authenticated owner) with two OAuth scopes; no admin role |
| A-3 / F-1 | CRUD prototype for Note with validation and error handling | `B/handlers/*`, `B/operations.py`, `B/services/notes_service.py`, `B/repositories/notes_repository.py`, `B/validation/notes.py` | `T/integration/test_api_flow.py`, `T/unit/*` | Implemented and verified (local) | `evidence/tests/backend-pytest.txt` | DynamoDB emulated by moto |
| F-2 | The five endpoints | `I` (5 `Events`), `B/handlers/` | `test_thesis_table_01…13`, `T/security/test_template.py`, `T/integration/test_local_demo_server.py`; live T01–T15 | **Implemented and verified on AWS** (eu-north-1, 2026-11-17) and locally | `evidence/tests/live-api-tests.json`; `evidence/aws/deployed-resources.txt` | — |
| F-5 | Status codes 201/200/400/401/403/404 | `B/errors.py`, `B/http.py`, `B/services/notes_service.py`; gateway responses in `I` | thesis-table tests; live T01–T15, A01–A07, R01–R02, V01–V04, L03 | **Implemented and verified on AWS** | `evidence/tests/live-api-tests.json` | Measured gateway behaviour: insufficient scope → 401; tampered signature → 403; unknown route with an `Authorization` header → 403 `BAD_REQUEST` (no gateway response type; see `docs/api/API.md`) |
| F-6 | Data model | `B/models/note.py` | `test_item_serialization`, `test_thesis_table_01` | Implemented and verified (local) | same | extra `version` attribute |
| F-7 | Validation of title/content | `B/validation/notes.py` | `T/unit/test_validation.py` (40+ cases) | Implemented and verified (local) | same | — |
| F-8 | 13 test cases | — | `test_thesis_table_01`–`13` (+ DELETE 404); live T01–T15 | **Implemented and verified on AWS** and locally | `evidence/tests/live-api-tests.json`; table in `docs/testing/TESTING.md` | — |

## Bachelor thesis scope (assignment items 4–5)

| ID | Description | Implementation | Tests | Status | Evidence | Limitations |
|---|---|---|---|---|---|---|
| A-4 / N-1 | Full serverless backend on AWS | `I` (API Gateway, 5 Lambdas, DynamoDB, Cognito, logs, alarms), `scripts/deployment/` | cfn-lint, `sam validate`, `sam build`; deployment; live suite | **Implemented and verified on AWS** — stack `serverless-notes-dev`, eu-north-1, deployed 2026-11-17 | `evidence/aws/stack-events.txt`, `evidence/aws/deployed-resources.txt` | development stage only (`Stage=dev`) |
| N-2 | Managed NoSQL database | `I` `NotesTable` (on-demand, SSE, GSI) | `T/integration/test_repository.py`; live CRUD + benchmark | **Implemented and verified on AWS** (table ACTIVE, on-demand, SSE enabled, GSI `byUser` ACTIVE) | `evidence/aws/deployed-resources.txt`, `evidence/tests/live-api-tests.json` | — |
| F-3 / N-3 | JWT authentication on all endpoints via managed directory | `I` `UserPool`, `WebClient`, `NotesResourceServer`, `Auth.Authorizer` + `AuthorizationScopes` per route; defence in depth `B/security/identity.py` | `T/unit/test_identity.py`, `T/security/test_template.py`; live A01–A07 | **Implemented and verified on AWS**: missing, garbage, tampered and ID tokens and a non-Bearer scheme are rejected; a read-only token can list but not create | `evidence/tests/live-api-tests.json` | expired token and wrong issuer not automated |
| F-4 / A-P2 | Per-user ownership and isolation | `B/services/notes_service.py`, conditional writes in `B/repositories/notes_repository.py`, `B/pagination.py` | `T/security/test_isolation.py`; live T04b, T07, T10, T13, H01, H02; browser check with two real Cognito users | **Implemented and verified on AWS** and locally | `evidence/tests/live-api-tests.json`; `evidence/screenshots/aws-11-isolation-forbidden.png` | — |
| A-4 user management | Registration, verification, sign-in, sign-out, password reset | `I` Cognito resources; `F/src/services/cognito/`, `F/src/services/auth/cognitoAuth.ts`, `F/src/pages/auth/CognitoAuthPanel.tsx` | unit tests (mocked); real browser against the deployed pool on 2026-11-17 | **Verified on AWS**: in-app sign-up (real `SignUp`, code e-mail sent), wrong code rejected with a clear message, hosted sign-in with PKCE, session restore after reload, sign-out clears the hosted session. Not verified: reading the e-mailed code (simulator mailbox; the account was confirmed by the operator), password reset | `docs/testing/TESTING.md` (AWS browser test) | no account deletion UI |
| N-4 / A-4 logging | Log every API call; inspect individual requests | `B/logging_utils.py`, `B/http.py`; `I` log groups (14 days) | pytest; CloudWatch on 2026-11-17 | **Implemented and verified on AWS**: one JSON line per request in each function's log group; a request id shown in the UI was traced with Logs Insights; no note content, tokens or e-mail addresses found in the logs | `evidence/aws/cloudwatch.txt` | API Gateway access logs left disabled (region-wide setting) |
| A-4 monitoring | Monitoring | `I` 4 alarms (API 5xx, p95 latency, Lambda errors, DynamoDB throttles), optional SNS | metrics checked with the alarms' dimensions | **Implemented and verified on AWS** (alarms `OK`, metrics receive data) | `evidence/aws/cloudwatch.txt` | no alarm has fired; notifications not exercised (no `AlarmEmail`) |
| A-P1 | Reliable, timely processing | conditional writes, optimistic locking, 503 on dependency failure, throttling, timeouts | pytest; AWS benchmark | **Verified on AWS** for the measured load: 500/500 requests succeeded, median ≈ 120 ms end to end | `evidence/benchmarks/aws-dev-eu-north-1.json` | sequential load only |
| N-5 | Extensible structure | layering (`docs/architecture/ARCHITECTURE.md` §2) | — | Implemented (design property; reviewed, not testable) | — | — |
| N-6 | AWS region, named services, Python | `I`, `infrastructure/samconfig.example.toml`, `B/` | deployment | **Implemented and verified on AWS** in eu-north-1 | `evidence/builds/aws-account-preflight.md`, `evidence/aws/deployed-resources.txt` | eu-north-1 instead of the text's eu-central-1 because the account's organization policy denies Frankfurt (ADR 0008); Python 3.13 instead of 3.11 (ADR 0007) |
| A-5 functionality | Evaluate functionality | `docs/testing/TESTING.md` | 187 + 66 + 14 local tests; 38 live checks | **Implemented and verified on AWS** and locally | `evidence/tests/` | — |
| A-5 performance | Evaluate performance | `docs/performance/PERFORMANCE.md`, `scripts/testing/benchmark.py` | AWS benchmark (100 cycles, 500 requests) + Lambda REPORT lines | **Implemented and verified on AWS** (sequential latency, cold starts) | `evidence/benchmarks/aws-dev-eu-north-1.json`, `evidence/aws/cloudwatch.txt` | single client, no concurrent load test |
| A-5 scalability | Evaluate scalability | `docs/performance/PERFORMANCE.md`, `docs/database/DATABASE.md` | — | Partially implemented (theoretical) | — | no load test |
| A-5 security | Evaluate security | `docs/security/SECURITY.md` (threat model, limitations) | security test suite; live A01–A07, isolation, CORS, validation | **Implemented and verified on AWS** for authentication, scopes, isolation, input validation and log hygiene | pytest + live evidence | no penetration test |
| A-5 costs | Evaluate costs | `AWS_COST_ANALYSIS.md` | Stockholm unit prices from the AWS Price List API | Implemented; unit prices verified (2026-11-16); real bill not yet available | `AWS_COST_ANALYSIS.md` | compare with Cost Explorer after a few days of use |
| A-5 future extensions | Discuss | `PROJECT_COMPLETION_REPORT.md` (limitations and future work), SECURITY.md limitations | — | Implemented (documentation) | — | — |
| A-P3 | Advantages over server-based solution | `docs/learning/01`, `12`; cost comparison in `AWS_COST_ANALYSIS.md` | — | Implemented (argument, documentation) | — | no measured comparison |

## Optional professional enhancements (not required by the assignment)

| Item | Implementation | Tests | Status | Evidence |
|---|---|---|---|---|
| Web client | `F/` (dashboard, notes, editor, architecture explorer, API explorer, settings) | 66 unit/component, 14 e2e (incl. axe audit); real browser against AWS | Implemented and verified (Local Demo and AWS mode) | `evidence/tests/frontend-*`, `evidence/screenshots/` |
| Local Demo mode | `backend/local_demo/server.py` | `T/integration/test_local_demo_server.py`, e2e | Implemented and verified | same |
| Optimistic locking (409) | repository + service + editor UI | `test_optimistic_locking_conflict_returns_409`, editor test | Implemented and verified (local) | pytest/vitest |
| Pagination | `B/pagination.py`, repository, notes page | pagination tests, e2e | Implemented and verified (local) | same |
| Infrastructure as code | `I`, `infrastructure/samconfig.example.toml` | cfn-lint, `sam validate`, `T/security/test_template.py`, deployment | **Deployed and verified** (eu-north-1) | `evidence/builds/`, `evidence/aws/` |
| CI pipeline | `.github/workflows/ci.yml` | runs on GitHub for this branch | see pull request checks | PR #1 |
| Public HTTPS frontend hosting | `infrastructure/frontend-hosting.yaml` (private S3 + CloudFront OAC + security headers), `scripts/deployment/deploy_hosting.sh`, `publish_frontend.sh`; ADR 0009 | `T/security/test_hosting_template.py`, cfn-lint; curl checks, live suite with the CloudFront origin, Playwright on the public URL | **Deployed and verified** (2026-11-17, https://d11c0a7q5fx9qi.cloudfront.net) | `evidence/tests/frontend-hosting-http-checks.txt`, `evidence/builds/aws-changeset-web-create.txt`, `evidence/screenshots/aws-13-hosted-cloudfront-notes.png` |
| Deploy pipeline (OIDC, manual) | `.github/workflows/deploy.yml` | YAML syntax only | Implemented, not verified (API job and frontend job; OIDC roles not created) | — |
| Live acceptance tests | `scripts/testing/live_api_tests.py` | executed 2026-11-17 | **38/38 passed** on the deployed stack | `evidence/tests/live-api-tests.json`, `evidence/tests/live-api-tests.txt` |
| Throttling (429), custom gateway errors | `I` | live L01–L03, A01–A07, R01–R02, C04 | **Verified on AWS**; throttling is best-effort (see `docs/performance/PERFORMANCE.md`) | `evidence/tests/live-api-tests.json` |
| Learning package | `docs/learning/`, `START_HERE.md`, `SUPERVISOR_QUESTIONS.md` | commands in lessons spot-checked | Implemented | — |

## What the author must still do personally

1. Register once with a real mailbox and enter the e-mailed code (the automated run used the SES mailbox simulator; the account was confirmed by the operator), and try password reset.
2. After a few days, compare the cost estimate with Cost Explorer (the stack costs cents; see `AWS_COST_ANALYSIS.md`).
3. Decide whether to keep the development stack running (`make destroy` removes it).
4. Take real CloudWatch screenshots for the thesis (the semestral report's screenshots are from other systems).
5. Rebuild the backend by hand following `docs/learning/` so that every design decision can be explained at the defence.

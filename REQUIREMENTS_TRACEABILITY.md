# Requirements traceability

Requirement identifiers are defined in [`docs/REQUIREMENTS.md`](docs/REQUIREMENTS.md). Status vocabulary:

- **Implemented and verified (local)** — code exists and automated tests passed against the in-memory emulator / in a real browser against the Local Demo.
- **Implemented, not verified** — code or configuration exists and passes static validation, but the behaviour depends on real AWS, which was not available.
- **Partially implemented**, **Not implemented**, **Blocked by external dependency**.

No requirement is marked verified on AWS: **the stack has not been deployed.**

Paths: `B/` = `backend/src/notes_api/`, `T/` = `backend/tests/`, `I` = `infrastructure/template.yaml`, `F/` = `frontend/`.

## Semestral thesis scope (assignment items 1–3)

| ID | Description | Implementation | Tests | Status | Evidence | Limitations |
|---|---|---|---|---|---|---|
| A-1 | Research of platforms, serverless, databases, auth | Thesis text (author's work); supporting material: `docs/architecture`, `docs/decisions`, `docs/learning` | — | Partially implemented (documentation support only) | — | The research chapter is the author's; this repository does not write it |
| A-2 | Design: entities, data model, endpoints, formats, access rules | `docs/api/API.md`, `docs/api/openapi.yaml`, `docs/database/DATABASE.md`, `docs/architecture/ARCHITECTURE.md` | OpenAPI validated | Implemented and verified (local) | — | "User roles": one role (authenticated owner) with two OAuth scopes; no admin role |
| A-3 / F-1 | CRUD prototype for Note with validation and error handling | `B/handlers/*`, `B/operations.py`, `B/services/notes_service.py`, `B/repositories/notes_repository.py`, `B/validation/notes.py` | `T/integration/test_api_flow.py`, `T/unit/*` | Implemented and verified (local) | `evidence/tests/backend-pytest.txt` | DynamoDB emulated by moto |
| F-2 | The five endpoints | `I` (5 `Events`), `B/handlers/` | `test_thesis_table_01…13`, `test_deployed_handler_modules_use_runtime_wiring`, `T/integration/test_local_demo_server.py` | Implemented and verified (local); routing in API Gateway not verified | same; `evidence/builds/infrastructure-validation.txt` | — |
| F-5 | Status codes 201/200/400/401/403/404 | `B/errors.py`, `B/http.py`, `B/services/notes_service.py`; gateway responses in `I` | thesis-table tests; `test_bad_bodies_return_400`; `test_invalid_uuid_returns_400` | Implemented and verified (local); gateway-generated 401/403/404/429 bodies not verified | same | Which status API Gateway returns for an insufficient scope must be observed live |
| F-6 | Data model | `B/models/note.py` | `test_item_serialization`, `test_thesis_table_01` | Implemented and verified (local) | same | extra `version` attribute |
| F-7 | Validation of title/content | `B/validation/notes.py` | `T/unit/test_validation.py` (40+ cases) | Implemented and verified (local) | same | — |
| F-8 | 13 test cases | — | `test_thesis_table_01`–`13` (+ DELETE 404) | Implemented and verified (local) | same; table in `docs/testing/TESTING.md` | rows 2 and 5 exercised below the gateway; live run pending (`scripts/testing/live_api_tests.py`) |

## Bachelor thesis scope (assignment items 4–5)

| ID | Description | Implementation | Tests | Status | Evidence | Limitations |
|---|---|---|---|---|---|---|
| A-4 / N-1 | Full serverless backend on AWS | `I` (API Gateway, 5 Lambdas, DynamoDB, Cognito, logs, alarms), `scripts/deployment/` | cfn-lint, `sam validate --lint`, `sam build` | Implemented, not verified — **blocked by external dependency (no AWS account access)** | `evidence/builds/infrastructure-validation.txt` | never deployed |
| N-2 | Managed NoSQL database | `I` `NotesTable` (on-demand, SSE, GSI) | `T/integration/test_repository.py` | Implemented and verified (local, emulator); real table not verified | pytest evidence | — |
| F-3 / N-3 | JWT authentication on all endpoints via managed directory | `I` `UserPool`, `WebClient`, `NotesResourceServer`, `Auth.DefaultAuthorizer`, `AuthorizationScopes`; defence in depth `B/security/identity.py` | Lambda boundary: `T/unit/test_identity.py`, `test_id_token_and_scope_boundaries`; real validation: `live_api_tests.py` A01–A07 | Implemented, not verified (gateway); Lambda part verified (local) | pytest evidence | signature/issuer/expiry checks cannot be tested without AWS |
| F-4 / A-P2 | Per-user ownership and isolation | `B/services/notes_service.py`, conditional writes in `B/repositories/notes_repository.py`, `B/pagination.py` | `T/security/test_isolation.py` (all methods, list, pagination, concurrency); e2e "users are isolated" | Implemented and verified (local) | pytest + Playwright evidence | live cross-user run pending |
| A-4 user management | Registration, verification, sign-in, sign-out | `I` Cognito resources; `F/src/services/cognito/`, `F/src/services/auth/cognitoAuth.ts`, `F/src/pages/auth/CognitoAuthPanel.tsx` | `F/src/services/auth/auth.test.ts`, `F/src/pages/pages.test.tsx` (mocked Cognito) | Implemented, not verified against real Cognito | `evidence/tests/frontend-vitest.txt` | no password-reset UI (Cognito hosted page offers "Forgot password"); no account deletion UI |
| N-4 / A-4 logging | Log every API call; inspect individual requests | `B/logging_utils.py`, `B/http.py` (one JSON line per request with `requestId`); `I` log groups, retention; optional access logs | `test_success_envelope_headers_and_log`, `test_unexpected_exception_becomes_generic_500`, `test_logs_contain_no_note_content_or_credentials` | Implemented and verified (local stdout); CloudWatch delivery not verified | pytest evidence; `docs/deployment/TROUBLESHOOTING.md` | — |
| A-4 monitoring | Monitoring | `I` 4 alarms (API 5xx, p95 latency, Lambda errors, DynamoDB throttles), optional SNS | cfn-lint only | Implemented, not verified | infra validation evidence | no dashboard (cost); alarms never observed firing |
| A-P1 | Reliable, timely processing | conditional writes, optimistic locking, 503 on dependency failure, throttling, timeouts | `test_database_failures_become_503`, `test_aws_failures_are_wrapped`, concurrency test | Implemented and verified (local) for logic; timeliness on AWS not measured | pytest evidence | — |
| N-5 | Extensible structure | layering (`docs/architecture/ARCHITECTURE.md` §2) | — | Implemented (design property; reviewed, not testable) | — | — |
| N-6 | AWS eu-central-1, named services, Python | `I`, `infrastructure/samconfig.example.toml`, `B/` | static validation | Implemented, not verified | — | Python 3.13 instead of the report's 3.11 (ADR 0007) |
| A-5 functionality | Evaluate functionality | `docs/testing/TESTING.md` | 166 + 63 + 12 tests | Implemented and verified (local) | `evidence/tests/` | AWS run pending |
| A-5 performance | Evaluate performance | `docs/performance/PERFORMANCE.md`, `scripts/testing/benchmark.py` | local emulator benchmark only | **Partially implemented** — analysis and tooling done; AWS measurement blocked | `evidence/benchmarks/local-demo-benchmark.json` (not AWS) | the author must measure on a deployed stack |
| A-5 scalability | Evaluate scalability | `docs/performance/PERFORMANCE.md`, `docs/database/DATABASE.md` | — | Partially implemented (theoretical) | — | no load test |
| A-5 security | Evaluate security | `docs/security/SECURITY.md` (threat model, limitations) | security test suite | Implemented and verified (local) for application logic; platform controls not verified | pytest evidence | no penetration test |
| A-5 costs | Evaluate costs | `AWS_COST_ANALYSIS.md` | arithmetic checked by hand | Partially implemented — model done; unit prices not re-verified, no real bill | — | verify prices before quoting |
| A-5 future extensions | Discuss | `PROJECT_COMPLETION_REPORT.md` (limitations and future work), SECURITY.md limitations | — | Implemented (documentation) | — | — |
| A-P3 | Advantages over server-based solution | `docs/learning/01`, `12`; cost comparison in `AWS_COST_ANALYSIS.md` | — | Implemented (argument, documentation) | — | no measured comparison |

## Optional professional enhancements (not required by the assignment)

| Item | Implementation | Tests | Status | Evidence |
|---|---|---|---|---|
| Web client | `F/` (dashboard, notes, editor, architecture explorer, API explorer, settings) | 63 unit/component, 12 e2e | Implemented and verified (Local Demo); AWS mode verified with mocks only | `evidence/tests/frontend-*`, `evidence/screenshots/` |
| Local Demo mode | `backend/local_demo/server.py` | `T/integration/test_local_demo_server.py`, e2e | Implemented and verified | same |
| Optimistic locking (409) | repository + service + editor UI | `test_optimistic_locking_conflict_returns_409`, editor test | Implemented and verified (local) | pytest/vitest |
| Pagination | `B/pagination.py`, repository, notes page | pagination tests, e2e | Implemented and verified (local) | same |
| Infrastructure as code | `I`, `infrastructure/samconfig.example.toml` | cfn-lint, sam validate, sam build | Implemented, not deployed | infra evidence |
| CI pipeline | `.github/workflows/ci.yml` | runs on GitHub for this branch | see pull request checks | PR #1 |
| Deploy pipeline (OIDC, manual) | `.github/workflows/deploy.yml` | YAML syntax only | Implemented, not verified | — |
| Live acceptance tests | `scripts/testing/live_api_tests.py` | `--help` only | Implemented, **never executed** | — |
| Throttling (429), custom gateway errors | `I` | cfn-lint | Implemented, not verified | — |
| Learning package | `docs/learning/`, `START_HERE.md`, `SUPERVISOR_QUESTIONS.md` | commands in lessons spot-checked | Implemented | — |

## What the author must still do personally

1. Deploy to their own AWS account, run `make live-test`, and record the results (this turns most "not verified" rows into verified ones).
2. Measure latency and cold starts on AWS and replace the theoretical performance evaluation with real numbers.
3. Verify the unit prices and, after some real use, compare the estimate with the actual bill.
4. Take real CloudWatch screenshots for the thesis (the semestral report's screenshots are from other systems).
5. Rebuild the backend by hand following `docs/learning/` so that every design decision can be explained at the defence.

# Requirements matrix — official assignment vs. delivered work

Status on 2026-11-17 (updated after the bachelor-stage evaluation). Authoritative sources: the official VUT assignment *Serverless CRUD API with Authentication* (academic requirements) and this repository (facts about the system). Detailed row-by-row traceability to code and tests: [`REQUIREMENTS_TRACEABILITY.md`](../../REQUIREMENTS_TRACEABILITY.md).

Status vocabulary: **Done (AWS)** = implemented and observed on the deployed stack; **Done (local)** = implemented and verified by automated tests locally; **Draft** = text exists, author must review; **Partial**; **Open**.

## A. Mandatory semestral thesis requirements (assignment items 1–3)

| # | Official requirement | Delivered | Code / evidence | Status | Missing work |
|---|---|---|---|---|---|
| 1 | Research cloud platforms, serverless technologies, managed databases, authentication/authorization incl. token-based access | Report chapters 2–3 (platform comparison, serverless trade-offs, DynamoDB, JWT, OAuth 2.0 + PKCE, Cognito, object-level authorization) | [`SEMESTRAL_REPORT.md`](SEMESTRAL_REPORT.md); `docs/learning/`, `docs/decisions/` | **Draft** | Author must read, verify sources, rewrite in own words ([`AUTHOR_REVIEW.md`](AUTHOR_REVIEW.md)) |
| 2 | Design the application and REST API: entities, data model, endpoints, request/response formats, user roles, access rules | Note entity; DynamoDB table + GSI `byUser`; five endpoints; JSON envelope; status codes; one role + two OAuth scopes; ownership rules | `docs/api/API.md`, `docs/api/openapi.yaml` (validated), `docs/database/DATABASE.md`, `docs/architecture/ARCHITECTURE.md`; report ch. 4 | **Done** | — |
| 3a | Prototype with CRUD for at least one entity | Five Lambda handlers, service, repository | `backend/src/notes_api/`; `evidence/tests/backend-pytest.txt` (193 passed, 99 %); `evidence/tests/live-api-tests.json` (38/38) | **Done (AWS)** | — |
| 3b | Simple validation | Strict validation, unknown fields rejected, all issues reported | `backend/src/notes_api/validation/notes.py`; `tests/unit/test_validation.py`; live V01–V04 | **Done (AWS)** | — |
| 3c | Error handling | `AppError` hierarchy, uniform envelope also for gateway errors, request ids | `errors.py`, `http.py`, template `GatewayResponses`; live A01–A07, R01–R02, L03 | **Done (AWS)** | — |
| 3d | Test the prototype | Unit, integration, security, live, browser tests | `docs/testing/TESTING.md`, `evidence/tests/` | **Done (AWS)** | — |
| 3e | Describe technologies and solution in the semestral report | Report draft | `SEMESTRAL_REPORT.md` | **Draft** | Author review; real screenshots as figures |
| — | Instruction: reliable, timely processing | Conditional writes, optimistic locking, 503 on dependency failure, throttling; 500/500 requests succeeded, median ≈ 120 ms | `evidence/benchmarks/aws-dev-eu-north-1.json` | **Done (AWS)** for one sequential client | Concurrent load (bachelor) |
| — | Instruction: basic security of accounts and data | Cognito password policy + e-mail verification, RS256 tokens + scopes at the gateway, ownership in conditional writes, least-privilege IAM, encryption at rest, HTTPS, log hygiene | `docs/security/SECURITY.md`; live A01–A07, T07/T10/T13, H01–H02 | **Done (AWS)** | — |
| — | Instruction: advantages of serverless over server-based | Argued (report 2.2, cost scenarios 6.6) | `AWS_COST_ANALYSIS.md` | **Partial** (argument, no measured comparison) | Measured comparison optional (bachelor) |

**Verdict:** all mandatory semestral requirements are supported by implementation and evidence. The written report exists as a draft that the author must review and adopt.

## B. Bachelor's thesis requirements (items 4–5) — updated 2026-11-17 after the bachelor-stage evaluation

| # | Official requirement | Delivered | Evidence | Status | Missing work |
|---|---|---|---|---|---|
| 4a | Full serverless backend: REST API, database, authentication | Stack `serverless-notes-dev` (eu-north-1), 33 resources from one SAM template | `evidence/aws/deployed-resources.txt`, `evidence/aws/stack-events.txt` | **Done (AWS)** | — |
| 4b | All required entities | Note + user accounts (Cognito); the assignment names no other entity | report ch. 2, 8 | **Done** | only if the bachelor assignment text adds entities |
| 4c | User management | sign-up, e-mail verification, password policy, reset, hosted sign-in with PKCE, sign-out | automated browser test on AWS; owner's manual real-mailbox check (no evidence file) | **Done (AWS)** | — |
| 4d | Logging | structured JSON per request, request-id tracing, 14-day retention, no personal data | `evidence/aws/cloudwatch.txt`, `evidence/aws/bachelor-evaluation.json` | **Done (AWS)** | — |
| 4e | Monitoring | 4 alarms (5xx, p95 latency, Lambda errors, DynamoDB throttles), state OK with data | `docs/operations/MONITORING_RELIABILITY.md` | **Done (AWS)**; notification path **not verified** (no `AlarmEmail`) | optional: set `AlarmEmail`, `set-alarm-state` test |
| 5a | Functionality | 193 + 66 + 14 automated tests; 38 live checks | `evidence/tests/` | **Evaluated** | — |
| 5b | Performance | sequential benchmark (500 req) + concurrency benchmark 1–8 clients (≈ 600 req) + Lambda REPORT statistics | `docs/performance/PERFORMANCE.md`, `evidence/benchmarks/aws-concurrency-*.json` | **Evaluated** (one client machine) | distributed load test (optional) |
| 5c | Scalability | measured to 8 clients / 60 req/s: linear throughput, stable median, Lambda scale-out to 8 environments, per-method throttle measured; beyond that argued from quotas | `docs/performance/PERFORMANCE.md` "Scalability evaluation" | **Evaluated within bounds** — large scale not demonstrated | raising limits + distributed load (cost) — documented as limitation |
| 5d | Security | 19-threat evaluation; live negative-token tests N01–N07, R01, E01; configuration review | `docs/security/SECURITY_EVALUATION.md`, `evidence/tests/token-security-tests.json` | **Evaluated**; no critical finding | penetration test (optional) |
| 5e | Costs | Price List API model, scenarios, Cost Explorer reconciliation (payable USD 0; gross usage = unrelated EC2), EC2 comparison | `AWS_COST_ANALYSIS.md`, `evidence/aws/bachelor-evaluation.json` | **Evaluated**; thesis-service bill not yet visible (reporting delay) | re-run Cost Explorer after a few days |
| 5f | Extensions | web client built and hosted; mobile client, integrations discussed | `docs/thesis/BACHELOR_THESIS_DRAFT.md` ch. 19 | **Done** | — |
| — | Written bachelor's thesis | technical content draft with figures | `docs/thesis/BACHELOR_THESIS_DRAFT.md`, `BACHELOR_AUTHOR_REVIEW.md` | **Draft** | author rewriting, Czech abstract, template, supervisor approval |

## C. Optional production features (not required — do not implement just to reach 100 %)

| Feature | State |
|---|---|
| React web client, public HTTPS hosting (S3 + CloudFront + OAC) | Done (AWS) |
| Local Demo mode, optimistic locking, pagination, OpenAPI | Done |
| CI (GitHub Actions) | Done; deploy workflow present, **not executed** (no OIDC role — acceptable, manual deployment is reproducible) |
| MFA, WAF, per-user rate limiting, SES, custom domain, backups, staging, tracing | Not implemented (listed as limitations / future work) |

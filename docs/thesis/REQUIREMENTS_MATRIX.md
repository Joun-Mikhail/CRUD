# Requirements matrix — official assignment vs. delivered work

Status on 2026-11-17. Authoritative sources: the official VUT assignment *Serverless CRUD API with Authentication* (academic requirements) and this repository (facts about the system). Detailed row-by-row traceability to code and tests: [`REQUIREMENTS_TRACEABILITY.md`](../../REQUIREMENTS_TRACEABILITY.md).

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

## B. Follow-up bachelor's thesis requirements (items 4–5)

| # | Official requirement | Delivered | Evidence | Status | Missing work |
|---|---|---|---|---|---|
| 4a | Full serverless backend: REST API, database, authentication | Stack `serverless-notes-dev` (eu-north-1), 33 resources from one SAM template | `evidence/aws/deployed-resources.txt`, `evidence/aws/stack-events.txt` | **Done (AWS)** | Production stage (backups, `Stage=prod`) optional |
| 4b | Support for all required entities | One entity (Note) — the only one the design defines | — | **Done** | Add entities only if the bachelor assignment asks for them |
| 4c | User management | Self sign-up, e-mail verification, password policy, password reset, hosted sign-in with PKCE, sign-out | automated browser test on AWS; owner's manual check with a real mailbox (2026-11-17, no evidence file) | **Done (AWS)** | Account deletion UI (optional) |
| 4d | Logging | One structured JSON line per request, request-id tracing, no personal data | `evidence/aws/cloudwatch.txt` | **Done (AWS)** | API Gateway access logs optional |
| 4e | Monitoring | 4 CloudWatch alarms with data, state OK | `evidence/aws/cloudwatch.txt` | **Done (AWS)**; notification path not exercised | Set `AlarmEmail` and trigger once |
| 5a | Evaluate functionality | 193 + 66 + 14 automated tests, 38 live checks | `evidence/tests/` | **Done (AWS)** | — |
| 5b | Evaluate performance | Sequential benchmark, cold-start analysis | `docs/performance/PERFORMANCE.md` | **Partial** | Concurrent load test |
| 5c | Evaluate scalability | Architectural argument only | `docs/performance/PERFORMANCE.md`, `docs/database/DATABASE.md` | **Open (theoretical only)** | Load test with raised limits |
| 5d | Evaluate security | Threat model, automated + live security tests | `docs/security/SECURITY.md` | **Partial** | Expired/foreign-issuer tokens; optional penetration test |
| 5e | Evaluate costs | Price List API unit prices, scenarios; Free plan credits USD 158.72 (2026-11-17) | `AWS_COST_ANALYSIS.md` | **Partial** | Compare with the real bill (Cost Explorer) |
| 5f | Discuss extensions (web/mobile client, integrations) | Web client built and hosted; extensions listed | report ch. 9; `PROJECT_COMPLETION_REPORT.md` | **Done** (web); discussion draft | Mobile client: discussion only |

## C. Optional production features (not required — do not implement just to reach 100 %)

| Feature | State |
|---|---|
| React web client, public HTTPS hosting (S3 + CloudFront + OAC) | Done (AWS) |
| Local Demo mode, optimistic locking, pagination, OpenAPI | Done |
| CI (GitHub Actions) | Done; deploy workflow present, **not executed** (no OIDC role — acceptable, manual deployment is reproducible) |
| MFA, WAF, per-user rate limiting, SES, custom domain, backups, staging, tracing | Not implemented (listed as limitations / future work) |

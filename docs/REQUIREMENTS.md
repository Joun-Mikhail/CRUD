# Requirements analysis

Source: the semestral thesis *Serverless CRUD API with Authentication* (Brno University of Technology, FEEC, Department of Telecommunications, 2025/26; 25 pages, read in full). This document separates the **official assignment** (binding) from the **report's implementation narrative** (historical, checked rather than trusted) and records what this implementation does about each.

## 1. Official assignment (thesis "Instruction" page)

| ID | Requirement | Stage |
|---|---|---|
| A-0 | Demonstrational serverless backend on a cloud platform: REST API with CRUD operations and secure user authentication, using serverless functions, an API gateway and a managed database | both |
| A-P1 | Reliable and timely processing of user requests | both |
| A-P2 | Basic security techniques protecting user accounts and stored data | both |
| A-P3 | Demonstrate advantages of serverless over a traditional server-based solution | both |
| A-1 | Research cloud platforms, serverless technologies, managed databases, authentication/authorization methods (e.g. token-based) | semestral |
| A-2 | Design the demonstration application and REST API architecture: entities and data model, endpoints, request/response formats, user roles and basic access rules | semestral |
| A-3 | Implement and test a basic prototype with CRUD for at least one entity, including simple validation and error handling; describe it in the report | semestral |
| A-4 | Implement the full serverless backend (REST API, database, authentication) with support for all required entities, user management, logging and monitoring | bachelor |
| A-5 | Evaluate functionality, performance, scalability, security and costs; discuss future extensions (web/mobile client, integrations) | bachelor |

## 2. Requirements stated in the report (sections 7.2, "API Design", "Security Model", "Request Handling")

| ID | Requirement |
|---|---|
| F-1 | CRUD for a Notes entity through a RESTful API |
| F-2 | Endpoints: `POST /notes`, `GET /notes`, `GET /notes/{id}`, `PUT /notes/{id}`, `DELETE /notes/{id}` |
| F-3 | JWT authentication required on all endpoints (`Authorization: Bearer <token>`) |
| F-4 | Each note belongs to one user; only the owner can read, update or delete it; ownership enforced by Lambda using the `sub` claim |
| F-5 | Status codes 201, 200, 400, 401, 403, 404; 403 for another user's existing note; 404 for a non-existing note; 201 for create, 200 for read/update/delete |
| F-6 | Data model: `noteId` (UUID), `userId` (from `sub`), `title`, `content`, `createdAt`, `updatedAt` (ISO 8601) |
| F-7 | Validate required fields `title` and `content` on create and update |
| F-8 | The 13 test cases in the report's table |
| N-1 | Fully managed serverless architecture that scales automatically |
| N-2 | Managed NoSQL database with high availability and durability |
| N-3 | Managed user directory issuing and verifying JWTs according to standards |
| N-4 | Log all API calls; individual requests must be inspectable |
| N-5 | API and codebase structured for future extension |
| N-6 | AWS, region eu-central-1; Lambda, API Gateway (REST API + Cognito authorizer), DynamoDB, Cognito, CloudWatch; Python |

## 3. Official behaviour vs. previous approach vs. this implementation

| Topic | Required | Report's documented approach | This implementation | Improvement | Verification |
|---|---|---|---|---|---|
| Endpoints | the five in F-2 | same; but screenshots show a "Task API" with one `/TASK` resource and a `PATCH` method | exactly the five; no PATCH | matches the specification rather than the screenshots | `test_api_flow.py`; template routes |
| Handlers | not prescribed | three: CreateNote, ListNotes, NoteById; screenshot shows a single function named `CRUD` | five single-purpose functions sharing one package | one IAM action and one log group per operation | template; ADR 0003 |
| Listing a user's notes | owner sees only own notes | "application-level filtering" over a `noteId`-only table (a Scan) | `Query` on GSI `byUser` | O(page) instead of O(table); other users' data never read | `test_list_uses_query_on_index_never_scan` |
| Primary key | uniquely identify notes | `noteId` partition key; future work: `userId`+`noteId` | `noteId` kept, index added | keeps the 403/404 distinction that a composite key would lose | DATABASE.md, ADR 0002 |
| Ownership check | enforced by Lambda | read item, compare `userId` | GET: read + compare; PUT/DELETE: condition inside the write | no race between check and write | `test_concurrent_writes…` |
| 403 vs 404 | 403 if exists and foreign; 404 if missing | same | same; trade-off documented | — | thesis rows 7, 8, 10, 11, 13 |
| "404 independent of authentication state" | (report sentence) | contradicts F-3 | unauthenticated requests always get 401, as F-3 and table rows 2 and 5 require | inconsistency resolved in favour of authentication | `test_thesis_table_02/05` |
| Missing DELETE-404 case | implied by F-5 | absent from the 13-row table | implemented and tested | gap closed | `test_delete_missing_note_returns_404` |
| Token type | "JWT access tokens" | figure shows HS256 token with `aud`; text says API Gateway checks `aud` | RS256 access tokens; authorizer requires scopes so ID tokens are refused; access tokens carry `client_id`, not `aud` | accurate description; least-privilege scopes | SECURITY.md; live A01–A07 (2026-11-17) |
| Cognito figure | user pool | figure shows *identity pools* / STS | user pool only | figure does not match the design; noted | — |
| Validation | required fields | "required fields such as title and content" | types, lengths, unknown fields, UUID, JSON, size, pagination | far stricter; all issues reported at once | `test_validation.py` |
| Errors | appropriate status + JSON | unspecified format | uniform envelope with code and request id, also for gateway errors | consistent and traceable | `test_http.py`, template `GatewayResponses` |
| Extra data fields | F-6 | six attributes | six + `version` (+ internal `userSortKey`) | lost-update protection | `test_optimistic_locking…` |
| Pagination | not required (named as future work) | none | `limit` + opaque `nextToken` | bounded responses | `test_pagination_walks…` |
| Deployment | not prescribed | AWS Console + CLI by hand; region text says eu-central-1 but screenshots show Stockholm (eu-north-1) | AWS SAM template, eu-north-1 (the account's organization policy denies eu-central-1; ADR 0008) | reproducible; matches the report's screenshots | cfn-lint, `sam validate`, CloudFormation change set |
| Runtime | Python | "Python 3.11" in text; the CloudWatch screenshot shows a Node.js 22 function failing with a ReferenceError | Python 3.13, arm64 | newer supported runtime; evidence must come from the real system | ADR 0007 |
| Throttling / stage | "must be completed" | defaults | stage throttle 10/20 → 429 | abuse and cost guard | live L01–L03 (2026-11-17; enforced approximately) |
| Logging | log all API calls, inspect individual requests | default Lambda logs | one structured JSON line per request with request id; 14-day retention | searchable in Logs Insights | `test_http.py` |
| Monitoring | required for bachelor stage | none | 4 CloudWatch alarms, optional e-mail | first failure signals | alarm metrics checked on AWS (2026-11-17); no alarm fired |
| IAM | "detailed IAM policies … future work" | unspecified | one action per function, resource-scoped | least privilege | template |
| S3 | — | appears in Figure 1 | not used | nothing requires it | — |
| User management | A-4 | Cognito console | Cognito self sign-up, e-mail verification, password policy, hosted sign-in; registration UI | users manage their own accounts | component tests (mocked); real browser on AWS (2026-11-17); real mailbox + password reset checked manually by the project owner on 2026-11-17 |
| Evaluation | A-5 | "not provided, must be measured" | AWS benchmark (500 requests), CloudWatch REPORT lines, cost model from the AWS Price List API | measured on AWS 2026-11-17; scalability argued, not load-tested | PERFORMANCE.md, AWS_COST_ANALYSIS.md |
| Client | future extension in A-5 | none | React web client (optional enhancement) | demonstrates the API; not a substitute for the backend work | vitest + Playwright |

## 4. Other defects noticed in the report (for the author to fix in the thesis text)

Duplicated and half-edited sentences (e.g. "AWS Region and Deployment", "DynamoDB Table Design", "API Gateway Configuration", "Limitations", "Conclusion"); figure captions that do not match the figures (Figure 6 caption describes a JWT but shows a REST illustration; the JWT image is uncaptioned); placeholder statements ("Figure represents a placeholder screenshot"); screenshots from unrelated resources (tables `CRUD`/`Tasks` with key `id`, user pool with a third-party e-mail address, 2019 and 2025 log samples); in-text citation numbers that do not match the literature list; abstract says "creating, retrieving, modifying, updating" (delete is missing); the bibliographic citation calls the semestral thesis a "Bachelor's Thesis". Third-party figures need source attribution.

## 5. Acceptance criteria used for this implementation

1. All five endpoints behave as in F-5 and the 13-row table (+ DELETE 404).
2. No request can read, change or delete another user's note; verified for every method.
3. Listing never scans; pagination is correct and cannot cross users.
4. Invalid input never causes a 5xx.
5. Template passes cfn-lint and `sam validate`; IAM has no wildcard action or resource.
6. Backend coverage ≥ 85 % with meaningful assertions; lint and strict type checks clean.
7. Frontend builds, passes type checks, unit tests and browser journeys in Local Demo.
8. Every claim in the documentation is either backed by evidence in `evidence/` or labelled "not verified".

Criteria 1–8 are met locally, and the AWS-dependent parts were verified on the deployed stack on 2026-11-17 — see `REQUIREMENTS_TRACEABILITY.md` and `docs/thesis/REQUIREMENTS_MATRIX.md`.

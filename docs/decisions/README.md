# Architecture decision records

Short records of the decisions that shape the system: context, the options considered, the choice, and what it costs.

## 0001 — API Gateway REST API with a Cognito user-pool authorizer and OAuth scopes

- **Context.** The thesis specifies "a single REST API … a Cognito authorizer". API Gateway offers REST APIs and the newer, cheaper HTTP APIs (with a generic JWT authorizer).
- **Options.** (a) REST API + Cognito authorizer; (b) HTTP API + JWT authorizer.
- **Decision.** (a). It matches the documented design; gateway responses can be customised so 401/403/429 use the same JSON envelope as Lambda errors (HTTP APIs cannot change those bodies); stage throttling is built in. The authorizer is configured with `AuthorizationScopes` on every route, which makes API Gateway require an **access token** with `notes/read` or `notes/write` instead of accepting ID tokens.
- **Consequences.** Roughly 3× the per-request price of an HTTP API (irrelevant at thesis scale, relevant at millions of requests); custom scopes can only be obtained through the hosted OAuth flow, which shaped ADR 0006.

## 0002 — `noteId` partition key plus `byUser` global secondary index

- **Context.** The report's table had only `noteId` and listed notes by scanning and filtering. Listing must be an efficient query; the 403-vs-404 distinction must be preserved.
- **Options.** (a) keep `noteId` PK, add GSI `userId` + `createdAt#noteId`; (b) composite primary key `userId` + `noteId`.
- **Decision.** (a). With (b) a note owned by someone else cannot be found by id, so the API could only answer 404, contradicting the thesis. Full comparison in `docs/database/DATABASE.md`.
- **Consequences.** Listing is eventually consistent; creates/deletes cost one extra index write.

## 0003 — One Lambda function per operation, one shared code package

- **Context.** The report planned three handlers (CreateNote, ListNotes, NoteById).
- **Decision.** Five functions (Create/List/Get/Update/Delete) deployed from the same `backend/src` package. Each gets an IAM role with exactly one DynamoDB action, its own log group, metrics and alarm dimension. The shared `api_handler` wrapper keeps each entry point to ~10 lines.
- **Consequences.** More resources in the template and five separate cold starts instead of three. A single "router" function would have fewer cold starts but one broad role; least privilege and per-operation observability were preferred.

## 0004 — Response envelope and status codes

- **Decision.** `{"data": …}` / `{"data": […], "meta": {…}}` / `{"error": {code, message, requestId, details?}}`. 403 for another user's existing note and 200 for DELETE, both because the thesis says so; trade-offs documented in `docs/api/API.md`. Unknown JSON fields are rejected rather than ignored so that attempts to set `userId` fail loudly. PUT is a full replacement (no PATCH — not in the required endpoint list).
- **Additions beyond the thesis list.** 409 (optimistic locking), 413, 415, 429, 503.

## 0005 — Local Demo runs the real handlers against in-memory DynamoDB

- **Context.** The application must be demonstrable without AWS, without pretending.
- **Options.** (a) mock API inside the browser; (b) `sam local` (needs Docker, still no Cognito); (c) a small Python HTTP server that builds API Gateway events and calls the real handlers, with `moto` as DynamoDB.
- **Decision.** (c) — `backend/local_demo/server.py`. Everything except authentication and the database engine is the production code path. Authentication is replaced by `Authorization: Demo <name>` and labelled as simulated everywhere (server banner, `X-Demo-Mode` header, UI banner).
- **Consequences.** `moto` is an emulator, not DynamoDB; the Local Demo proves logic, not AWS behaviour or performance.

## 0006 — Browser authentication: in-app sign-up, hosted sign-in with PKCE, tokens in memory

- **Context.** The API needs access tokens with custom scopes; Cognito only issues those through its OAuth endpoints (hosted login). The assignment also asks for a registration form with password policy and verification.
- **Decision.** Registration and e-mail verification call Cognito's public `SignUp` / `ConfirmSignUp` API directly from the app. Sign-in redirects to the Cognito hosted page using Authorization Code + PKCE; the password is never typed into this application. Tokens live in JavaScript memory only; a silent redirect restores the session after a page reload (Cognito's own session cookie makes it invisible when still signed in).
- **Consequences.** No AWS SDK or Amplify dependency (small bundle). A reload costs a redirect round trip. The classic hosted page has Cognito's default look.

## 0007 — Python 3.13 on arm64, no third-party runtime dependencies

- **Context.** The report named Python 3.11.
- **Decision.** Python 3.13 (a newer supported Lambda runtime with a longer support window), arm64 (lower price per GB-second than x86). The deployed package contains only this project's code; `boto3` comes from the runtime. Validation is hand-written (≈150 lines) instead of pulling in a framework.
- **Consequences.** Small package and fast cold start; the runtime's bundled boto3 version is not pinned (acceptable: only long-stable DynamoDB calls are used; `ReturnValuesOnConditionCheckFailure` requires boto3 ≥ 1.28, which current runtimes exceed). Check the Lambda runtime support table before deploying.

## 0008 — Region eu-north-1 (Stockholm) instead of eu-central-1 (Frankfurt)

- **Context.** The thesis text names eu-central-1, while its screenshots show Stockholm. The AWS account available for the project belongs to an AWS Organization whose service control policy allows the workload services only in eu-north-1: on 2026-11-16 the IAM policy simulator returned `explicitDeny` (denied by Organizations) for `cloudformation:CreateChangeSet`, `lambda:CreateFunction` and `cognito-idp:CreateUserPool` with `aws:RequestedRegion` set to eu-central-1, eu-west-1 or us-east-1, and `allowed` for eu-north-1.
- **Decision.** eu-north-1 is the project region: default of the helper scripts, `samconfig.example.toml`, CI validation, the deploy workflow, tests and documentation. The template stays region-neutral and the scripts still follow `AWS_REGION`.
- **Consequences.** The deployment matches the thesis screenshots rather than the thesis text; state this deviation in the thesis. All services used (Cognito user pools with the Lite tier, Lambda `python3.13` on arm64, API Gateway REST APIs, DynamoDB on-demand, CloudWatch) exist in eu-north-1 — the change set for the full stack was accepted there. Unit prices differ slightly from Frankfurt; `AWS_COST_ANALYSIS.md` now uses Stockholm prices read from the AWS Price List API.

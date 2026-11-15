# CLAUDE.md — working agreement for this repository

Serverless Notes: thesis reference implementation of a secure serverless CRUD API (API Gateway REST + Cognito authorizer → 5 Python Lambdas → DynamoDB), a React client, SAM infrastructure. Read `PROJECT_STATE.md` for current status before starting work.

## Architecture in five lines

- `backend/src/notes_api/`: `handlers/*` (entry points) → `http.api_handler` (identity, scope, envelope, error mapping, logging) → `operations.py` (parse/validate) → `services/notes_service.py` (rules) → `repositories/notes_repository.py` (only DynamoDB access). `runtime.py` wires real dependencies.
- DynamoDB: PK `noteId`; GSI `byUser` (`userId`, `userSortKey = createdAt#noteId`). Never `Scan`.
- Ownership: GET compares owner in the service; PUT/DELETE use a condition expression with `ReturnValuesOnConditionCheckFailure=ALL_OLD` → 404 / 403 / 409.
- `backend/local_demo/server.py`: Local Demo — real handlers, `moto` DynamoDB, simulated identities (`Authorization: Demo alice`).
- `frontend/`: React + TS + Vite + Tailwind; one `AuthService` interface with demo and Cognito (PKCE, in-memory tokens) implementations.

## Commands

```bash
make setup                      # install everything
make demo-backend / demo-frontend
make test-backend               # cd backend && .venv/bin/pytest --cov
make test-frontend              # cd frontend && npm test
make test-e2e                   # Playwright (use --trace off)
make lint typecheck build
cfn-lint infrastructure/template.yaml && sam validate --lint --region eu-central-1 -t infrastructure/template.yaml
```
Single backend test: `cd backend && .venv/bin/pytest tests/security -k isolation -v`.

## Conventions

- Python 3.13, type hints everywhere, `mypy --strict`, `ruff` (line length 100). No third-party runtime dependencies in `backend/src` (boto3 comes from the Lambda runtime).
- Errors: raise an `AppError` subclass (`errors.py`); never build error responses by hand. New status/code → update `docs/api/API.md`, `openapi.yaml` and the frontend `FALLBACK_CODES`.
- Response envelope is fixed: `{"data"}` / `{"data","meta"}` / `{"error":{code,message,requestId,details?}}`.
- TypeScript strict, no `any`; components small; no inline styles (production CSP forbids them).
- Every behaviour change needs a test. Backend coverage gate is 85 %.
- Keep `docs/`, `REQUIREMENTS_TRACEABILITY.md` and `PROJECT_STATE.md` in step with the code in the same change.

## Security rules (do not weaken)

1. Caller identity comes only from `event.requestContext.authorizer.claims.sub`.
2. Unknown request fields are rejected; the client can never set `userId`, `noteId`, timestamps or `version` (except `version` as the optimistic-lock precondition on PUT).
3. Ownership checks for writes stay inside the DynamoDB condition expression.
4. Never log titles, content, headers or tokens. Never return stack traces.
5. IAM: one action per function, scoped to the table or index ARN; no wildcards.
6. Frontend tokens stay in memory; never render or log them.
7. The thesis-mandated behaviours stay: 403 for another user's existing note, 404 for missing, 200 for DELETE, the five endpoints exactly.
8. No secrets or AWS credentials in the repository. `frontend/.env.aws` and `infrastructure/samconfig.toml` are git-ignored.

## Honesty rules

- Never claim AWS deployment, live test results, benchmarks or prices that were not actually produced. As of the last update the stack has **never been deployed**.
- Local Demo results must be labelled as local/emulator results.
- Record real command outputs under `evidence/`.

## Decisions already made (see `docs/decisions/README.md`)

REST API + Cognito authorizer with scopes (not HTTP API) · `noteId` PK + GSI (not composite key) · five functions · Local Demo runs real handlers on moto · in-app sign-up + hosted sign-in with PKCE · Python 3.13 arm64.

## Current constraints

- No AWS credentials in the build environment; anything requiring AWS is unverified.
- CI triggers on pull requests and on pushes to `main`. Deploy workflow is manual only.

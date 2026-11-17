# Project state

Last updated: 2026-11-17.

## Current phase

**Deployed and verified on AWS; frontend publicly hosted; semestral report drafted; bachelor-stage evaluation done and bachelor's thesis drafted (author review pending).** The app is public at **https://d11c0a7q5fx9qi.cloudfront.net** (S3 + CloudFront, stack `serverless-notes-dev-web`, ADR 0009, since 2026-11-17). The development stack `serverless-notes-dev` runs in **eu-north-1** (Stockholm; ADR 0008 — the account's organization policy denies eu-central-1). It was deployed from this repository on 2026-11-17 and tested end to end: live API suite, browser test of the AWS mode with real Cognito users, CloudWatch checks and a bounded benchmark.

## Completed

| Area | State |
|---|---|
| Discovery | Thesis PDF read in full; requirements and inconsistencies in `docs/REQUIREMENTS.md` |
| Backend | 5 handlers, operations, service, DynamoDB repository, validation, pagination, identity, logging; boto3 set-up during Lambda init (`runtime.prewarm()`) |
| Local Demo | `backend/local_demo/server.py` (real handlers + moto) |
| Infrastructure | `infrastructure/template.yaml` — cfn-lint, `sam validate` (SAM transform), `sam build`, template tests; **deployed** (33 resources) |
| Frontend | auth (demo + Cognito PKCE), dashboard, notes, editor, architecture explorer, API explorer, settings; **AWS mode verified in a real browser** |
| Local tests | backend 193 passed (99 % coverage, re-run 2026-11-17); frontend 66 passed; Playwright 14 passed (incl. axe audit) |
| Frontend hosting | S3 + CloudFront deployed 2026-11-17; headers, HTTPS redirect, deep links, private bucket, CORS checked; live suite 38/38 with the CloudFront origin; browser sign-in/CRUD/reload/sign-out on the public URL (`docs/testing/TESTING.md`) |
| AWS tests | live suite 38/38 (`evidence/tests/live-api-tests.json`); browser test (sign-up, sign-in, CRUD, reload, isolation, sign-out, token storage); CloudWatch logs/Insights/alarm metrics (`evidence/aws/cloudwatch.txt`); benchmark 500/500 (`evidence/benchmarks/aws-dev-eu-north-1.json`) |
| Static checks | ruff, mypy strict, eslint, tsc, pip-audit, npm audit — clean |
| CI | `.github/workflows/ci.yml` (now also runs the plain `sam validate`) |
| Docs | all documents updated with the AWS results (2026-11-17); stale "not deployed" statements removed (README, SECURITY, REQUIREMENTS, frontend README) |
| Bachelor evaluation (2026-11-17) | concurrency benchmark 1–8 clients (median 120–126 ms, no errors, Lambda scaled to 8 environments), per-method throttle measured; negative-token tests 9/9 (immediate checks); security, monitoring/reliability and cost evaluations incl. Cost Explorer reconciliation (`docs/performance/PERFORMANCE.md`, `docs/security/SECURITY_EVALUATION.md`, `docs/operations/MONITORING_RELIABILITY.md`, `AWS_COST_ANALYSIS.md`) |
| Thesis | bachelor's thesis **content draft** `docs/thesis/BACHELOR_THESIS_DRAFT.md` with figures; semestral report **draft** `docs/thesis/SEMESTRAL_REPORT.md` (+ DOCX review copy), requirements matrix, author review list, supervisor summary, demo script (2026-11-17; AI-assisted, author review pending) |
| Cost | Stockholm unit prices from the AWS Price List API; account pre-flight in `evidence/builds/aws-account-preflight.md` |

## Deployed resources (eu-north-1)

Stack `serverless-notes-dev`: REST API `serverless-notes-dev-api` (stage `dev`), 5 Lambda functions `serverless-notes-dev-*-note(s)`, table `serverless-notes-dev-notes`, user pool `serverless-notes-dev-users` with hosted domain `serverless-notes-dev-<account-id>`, web and read-only test clients, 5 log groups (14 days), 4 alarms. Plus the SAM artifact stack `aws-sam-cli-managed-default` (one S3 bucket) and the hosting stack `serverless-notes-dev-web` (private S3 bucket, CloudFront distribution `E8D7IG63UT1JB`, Origin Access Control, response-headers policy). The API's `AllowedOrigin` is the CloudFront URL; Cognito callback/logout URLs list both localhost and CloudFront; `npm run dev:aws` reaches the API through the Vite proxy. The pool contains the owner's real account (test users were deleted after each run). `frontend/.env.aws` (git-ignored) points the app at this stack.

Expected cost: about $0.90 per month for the alarm metrics at list price (possibly free under CloudWatch's always-free allowance) plus fractions of a cent per thousand requests; covered by the account's Free-plan credits. `make destroy` removes the stack.

## Pending

1. Author: review, verify and adopt the report draft (`docs/thesis/AUTHOR_REVIEW.md`); take real console screenshots; agree the AI-use statement with the supervisor.
2. Compare the cost estimate with Cost Explorer after a few days (Free plan credits USD 158.72 on 2026-11-17).
3. Author: review the bachelor's draft (`docs/thesis/BACHELOR_AUTHOR_REVIEW.md`); re-check Cost Explorer once the thesis services appear. Optional: `AlarmEmail` + notification test, distributed load test, PITR/deletion protection for a production stage.
4. Optional: GitHub OIDC roles + environment for `.github/workflows/deploy.yml` (API job and frontend job); raise the stage throttle for real use (see "Known gaps").

## Important decisions

See `docs/decisions/README.md` (ADR 0001–0008): REST API + Cognito authorizer with scopes; `noteId` PK + `byUser` GSI; five functions; uniform envelope, 403/404 and DELETE 200 per thesis; Local Demo on moto; in-app sign-up + hosted sign-in with PKCE and in-memory tokens; Python 3.13 arm64; region eu-north-1.

## Known bugs

None open. Fixed during deployment (2026-11-16/17): SAM transform rejected `AuthorizationScopes` without an explicit `Authorizer`; validation in CI/Makefile only ran cfn-lint (`--lint`), not the transform; first request after every cold start took ≈ 1 s (lazy boto3 set-up); Windows: Playwright could not start the backend, Local Demo printed tracebacks on aborted connections; live test script bugs (tuple expectations, shadowed variable, no 429 retry).

## Known gaps (not bugs)

- Measured API Gateway behaviour that cannot be changed in the template: unknown route *with* an `Authorization` header → 403 `BAD_REQUEST` (404 without); bodies over 10 MB → plain-text 413 without CORS; stage throttling is approximate and can keep throttling a method for minutes after a burst (`docs/performance/PERFORMANCE.md`).
- Real mailbox, e-mailed code, password reset and CRUD on the public site: checked manually by the owner on 2026-11-17 (no evidence file).
- Verified 2026-11-17: expired tokens (pending (expected 401)), forged/foreign-issuer tokens rejected. Not verified: alarm notifications (no `AlarmEmail`), a token from a second real user pool, `destroy.sh`, the GitHub deploy workflow, behaviour above ≈ 60 req/s.
- Throttling is 10 req/s, burst 20 **per method** (measured), not per stage.
- No account-deletion screen; the hosted site uses the default `*.cloudfront.net` certificate (no custom domain); per-user rate limiting, MFA, WAF not included.
- Chromium only; no manual screen-reader review.

## Exact next action

Owner: review the thesis-documentation pull request and work through `docs/thesis/AUTHOR_REVIEW.md`; decide whether to keep both stacks running (`scripts/cleanup/destroy_hosting.sh`, `make destroy`).

# Project state

Last updated: 2026-11-17.

## Current phase

**Deployed and verified on AWS.** The development stack `serverless-notes-dev` runs in **eu-north-1** (Stockholm; ADR 0008 — the account's organization policy denies eu-central-1). It was deployed from this repository on 2026-11-17 and tested end to end: live API suite, browser test of the AWS mode with real Cognito users, CloudWatch checks and a bounded benchmark.

## Completed

| Area | State |
|---|---|
| Discovery | Thesis PDF read in full; requirements and inconsistencies in `docs/REQUIREMENTS.md` |
| Backend | 5 handlers, operations, service, DynamoDB repository, validation, pagination, identity, logging; boto3 set-up during Lambda init (`runtime.prewarm()`) |
| Local Demo | `backend/local_demo/server.py` (real handlers + moto) |
| Infrastructure | `infrastructure/template.yaml` — cfn-lint, `sam validate` (SAM transform), `sam build`, template tests; **deployed** (33 resources) |
| Frontend | auth (demo + Cognito PKCE), dashboard, notes, editor, architecture explorer, API explorer, settings; **AWS mode verified in a real browser** |
| Local tests | backend 187 passed (99 % coverage); frontend 66 passed; Playwright 14 passed (incl. axe audit) |
| AWS tests | live suite 38/38 (`evidence/tests/live-api-tests.json`); browser test (sign-up, sign-in, CRUD, reload, isolation, sign-out, token storage); CloudWatch logs/Insights/alarm metrics (`evidence/aws/cloudwatch.txt`); benchmark 500/500 (`evidence/benchmarks/aws-dev-eu-north-1.json`) |
| Static checks | ruff, mypy strict, eslint, tsc, pip-audit, npm audit — clean |
| CI | `.github/workflows/ci.yml` (now also runs the plain `sam validate`) |
| Docs | all documents updated with the AWS results (2026-11-17) |
| Cost | Stockholm unit prices from the AWS Price List API; account pre-flight in `evidence/builds/aws-account-preflight.md` |

## Deployed resources (eu-north-1)

Stack `serverless-notes-dev`: REST API `serverless-notes-dev-api` (stage `dev`), 5 Lambda functions `serverless-notes-dev-*-note(s)`, table `serverless-notes-dev-notes`, user pool `serverless-notes-dev-users` with hosted domain `serverless-notes-dev-<account-id>`, web and read-only test clients, 5 log groups (14 days), 4 alarms. Plus the SAM artifact stack `aws-sam-cli-managed-default` (one S3 bucket). After the tests the pool has no users and the table no notes. `frontend/.env.aws` (git-ignored) points the app at this stack.

Expected cost: about $0.90 per month for the alarm metrics at list price (possibly free under CloudWatch's always-free allowance) plus fractions of a cent per thousand requests; covered by the account's Free-plan credits. `make destroy` removes the stack.

## Pending

1. Register once with a real mailbox, enter the e-mailed code, try password reset (the automated run used the SES mailbox simulator; the account was confirmed by the operator).
2. Compare the cost estimate with Cost Explorer after a few days.
3. Optional: GitHub OIDC role + environment for `.github/workflows/deploy.yml`; frontend hosting (S3 + CloudFront); raise the stage throttle for real use (see "Known gaps").

## Important decisions

See `docs/decisions/README.md` (ADR 0001–0008): REST API + Cognito authorizer with scopes; `noteId` PK + `byUser` GSI; five functions; uniform envelope, 403/404 and DELETE 200 per thesis; Local Demo on moto; in-app sign-up + hosted sign-in with PKCE and in-memory tokens; Python 3.13 arm64; region eu-north-1.

## Known bugs

None open. Fixed during deployment (2026-11-16/17): SAM transform rejected `AuthorizationScopes` without an explicit `Authorizer`; validation in CI/Makefile only ran cfn-lint (`--lint`), not the transform; first request after every cold start took ≈ 1 s (lazy boto3 set-up); Windows: Playwright could not start the backend, Local Demo printed tracebacks on aborted connections; live test script bugs (tuple expectations, shadowed variable, no 429 retry).

## Known gaps (not bugs)

- Measured API Gateway behaviour that cannot be changed in the template: unknown route *with* an `Authorization` header → 403 `BAD_REQUEST` (404 without); bodies over 10 MB → plain-text 413 without CORS; stage throttling is approximate and can keep throttling a method for minutes after a burst (`docs/performance/PERFORMANCE.md`).
- Not verified: entering a real e-mailed code, password reset against real Cognito, expired-token and wrong-issuer cases, alarm notifications, `destroy.sh`, the GitHub deploy workflow.
- No account-deletion screen; no frontend hosting; per-user rate limiting, MFA, WAF not included.
- Chromium only; no manual screen-reader review.

## Exact next action

Owner: register with a real e-mail address in `npm run dev:aws` (step 1 above); review and merge the pull request; decide whether to keep the stack running or `make destroy` it.

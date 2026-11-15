# Project state

Last updated: 2026-11-15.

## Current phase

Phase 12 (delivery) complete for everything that can be done without AWS. Phases needing AWS (real deployment verification, live tests, AWS performance measurement) are **blocked**: no usable AWS credentials were available (the keys present in the build environment were rejected by STS with `InvalidClientTokenId`).

## Completed

| Area | State |
|---|---|
| Discovery | Thesis PDF (25 pages) read in full; requirements and inconsistencies in `docs/REQUIREMENTS.md` |
| Backend | 5 handlers, operations, service, DynamoDB repository, validation, pagination, identity, logging |
| Local Demo | `backend/local_demo/server.py` (real handlers + moto) |
| Infrastructure | `infrastructure/template.yaml` — passes cfn-lint, `sam validate --lint`, `sam build` |
| Frontend | auth (demo + Cognito PKCE), dashboard, notes, editor, architecture explorer, API explorer, settings |
| Tests | backend 166 passed (98.99 % coverage); frontend 63 passed; Playwright 12 passed |
| Static checks | ruff, mypy strict, eslint, tsc, pip-audit, npm audit — clean |
| CI | `.github/workflows/ci.yml` green on PR #1 (4 jobs) |
| Docs | README, START_HERE, architecture, API + OpenAPI, database, security, testing, deployment, troubleshooting, performance, cost, decisions, 12 lessons, supervisor questions, traceability, completion report |
| Evidence | `evidence/tests`, `evidence/builds`, `evidence/benchmarks` (local only), `evidence/screenshots` |

## Pending (all require an AWS account — to be done by the repository owner)

1. `make deploy` to a development account in eu-central-1; note and fix any first-deployment issues.
2. `make frontend-env`, `npm run dev:aws`: first real sign-up / verification / sign-in / CRUD in AWS mode.
3. `make live-test` (never executed; expect to debug the script itself, especially the hosted-login form flow).
4. Confirm on the live stack: status returned by the authorizer for an insufficient scope; unknown route → 404 mapping; CORS preflight from the browser; 429 throttling; `scope` claim forwarded to Lambda; alarms; log output in CloudWatch.
5. Measure warm/cold latency (`docs/performance/PERFORMANCE.md`); store results in `evidence/benchmarks/`.
6. Verify unit prices in `AWS_COST_ANALYSIS.md`; compare with the real bill.
7. Configure the GitHub environment + OIDC role if the deploy workflow is wanted.
8. Update `docs/testing/TESTING.md`, `REQUIREMENTS_TRACEABILITY.md` and the completion report with the real results.

## Important decisions

See `docs/decisions/README.md` (ADR 0001–0007): REST API + Cognito authorizer with scopes; `noteId` PK + `byUser` GSI; five functions; uniform envelope, 403/404 and DELETE 200 per thesis; Local Demo on moto; in-app sign-up + hosted sign-in with PKCE and in-memory tokens; Python 3.13 arm64.

## Known bugs

None open. Fixed during the build: logger bound to the wrong stdout stream; Local Demo server raised `BrokenPipeError` when a browser cancelled a request; production build was built without mode-specific configuration (CSP `connect-src` lacked the API origin) — `npm run build` now builds demo mode and `build:aws` AWS mode.

## Known gaps (not bugs)

- No password-reset or account-deletion screens in the app.
- Frontend hosting (S3 + CloudFront) not included.
- Per-user rate limiting, MFA, WAF not included.
- No automated accessibility audit; Chromium only.
- Expired-token and wrong-issuer cases are not automated even in the live script.

## Environment limitations of the build session

- No AWS access (see above). No Docker, so `sam local` was not used.
- Three helper agents (frontend, learning docs, pricing research) were cut off by a usage limit early on; their work was completed directly. Pricing could therefore not be re-verified online.

## Exact next action

Owner: obtain AWS development credentials → `cd infrastructure && cp samconfig.example.toml samconfig.toml` → `make deploy` → follow "Pending" 2–8.

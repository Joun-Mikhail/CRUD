# Troubleshooting

## How to investigate a failed request

1. **Identify the request.** Every error body contains `error.requestId` (the API explorer and the editor's error message show it). Note the time and the endpoint.
2. **Pick the log group.** One per function: `/aws/lambda/<stack>-create-note`, `-list-notes`, `-get-note`, `-update-note`, `-delete-note`.
3. **Find the entry** with CloudWatch Logs Insights (select all five groups):
   ```
   fields @timestamp, operation, status, errorCode, errorCategory, durationMs, userId
   | filter requestId = "PASTE-REQUEST-ID"
   ```
   No result? Then Lambda never ran — API Gateway rejected the request (401/403/429/404). Check the status and `error.code` the client received, and API Gateway metrics (`4XXError`), or enable access logs (`EnableApiAccessLogs=true`).
4. **Determine the category.** `errorCategory`: `client` (4xx — the request was wrong), `dependency` (503 — DynamoDB failed/throttled), `server` (500 — a bug).
5. **For 500/503 read the companion entry** `unhandled_exception` or `dependency_failure` with the same `requestId`; it contains `stackTrace`.
   ```
   fields @timestamp, message, operation, errorCode, stackTrace | filter level = "ERROR" | sort @timestamp desc | limit 20
   ```
6. **Fix** (code, IAM permission, configuration), add a test that reproduces it, deploy.
7. **Verify** by repeating the request and checking that the alarm (if any) returns to OK.

Useful queries: slowest operations — `stats avg(durationMs), pct(durationMs,95), count() by operation`; error breakdown — `filter status >= 400 | stats count() by operation, errorCode`.

Locally the same JSON lines are printed by `make demo-backend`.

## First deployment (2026-11-16/17, eu-north-1) — what actually went wrong

| Symptom | Cause / fix |
|---|---|
| `sam deploy`: change set `FAILED` — `Transform AWS::Serverless-2016-10-31 failed … Event with id [Api] is invalid. AuthorizationScopes works only when Authorizer is set` (five times, one per function) | The API events set `Auth.AuthorizationScopes` and relied on the API's `DefaultAuthorizer`. The SAM transform requires the event to name the authorizer too. Fixed by adding `Authorizer: CognitoAuthorizer` to each event. The processed template now carries the scopes per method (`notes/read` on both GETs, `notes/write` on POST/PUT/DELETE). |
| The same template had passed `sam validate --lint` locally and in CI | `--lint` makes `sam validate` run cfn-lint **only**; the SAM transform is skipped. `[default.validate.parameters] lint = true` in `samconfig.toml` had the same effect on a plain `sam validate`. Fixed: the `Makefile`, CI, the deploy workflow and `deploy.sh` now run the plain `sam validate` as well, and the example configuration no longer sets `lint`. |
| Any deployment call in eu-central-1 is denied | The account's AWS Organization allows the services only in eu-north-1 (ADR 0008). Check with `aws iam simulate-principal-policy … --context-entries ContextKeyName=aws:RequestedRegion,…`. |
| A failed change set leaves the stack in `REVIEW_IN_PROGRESS` | Harmless and free: the stack has no resources. Delete the failed change set (`aws cloudformation delete-change-set`) or the empty stack, then retry. |
| `make live-test` / `make frontend-env`: `MissingDependencyException: Using the login credential provider requires an additional dependency … botocore[crt]` | The profile was created with `aws login`; boto3 needs `botocore[crt]` for it. Either `pip install "botocore[crt]"` into the venv or export short-lived credentials: `eval "$(aws configure export-credentials --profile <p> --format env)"; unset AWS_PROFILE`. |
| Live test A02 (tampered signature) expected 401, got **403** `FORBIDDEN` | That is how the Cognito authorizer answers a well-formed JWT whose signature does not verify (`x-amzn-ErrorType: AccessDeniedException` → `ACCESS_DENIED` gateway response). Still rejected; the expectation now accepts 401 or 403. |
| A token without the route's scope gets **401**, not 403 | Measured behaviour of the Cognito authorizer (`UnauthorizedException`). Documented in `docs/api/API.md`. |
| Unknown route or method gets **403 `BAD_REQUEST`** when an `Authorization` header is sent (404 without it) | API Gateway raises `IncompleteSignatureException`. Adding an `INVALID_SIGNATURE` gateway response did not change it; a temporary diagnostic (`$context.error.responseType` in the `DEFAULT_4XX` message) showed the type is `DEFAULT_4XX` itself, so it cannot be mapped separately. Diagnostic and mapping were removed again; behaviour documented. |
| Bodies over 10 MB: 413 with a plain-text body and no CORS header | API Gateway's hard payload limit applies before gateway responses. The application's own limit (128 KiB → 413 `PAYLOAD_TOO_LARGE` with envelope) covers realistic cases. |
| Throttling: 60 concurrent requests gave no 429; later, `GET /notes` answered 429 for minutes at one request every 4 s | Stage throttling is best-effort and is not applied to requests the authorizer rejects. After a burst it can keep throttling the burst method; it recovered within about 10 minutes. The live test now bursts 2 × 120 authenticated requests, runs the burst last, and retries 429 for ordinary checks. |
| The first request after every cold start took about 1 s inside Lambda | The boto3 resource was created lazily on the first request (botocore loads its service model). `runtime.prewarm()` now does it during init; first-request time fell to ≈ 140–170 ms (`docs/performance/PERFORMANCE.md`). |
| Git Bash: `aws logs … --log-group-name /aws/lambda/…` fails with a pattern error | Git Bash rewrites arguments that look like Unix paths into Windows paths. Prefix the command with `MSYS_NO_PATHCONV=1`. |

## Local development

| Symptom | Cause / fix |
|---|---|
| Sign-in page: "The local backend is not reachable" | Start it: `make demo-backend`. Port 8787 must be free. |
| Windows: Playwright cannot start the backend (`'..' is not recognized…` or `No module named 'boto3'`) | Fixed in `frontend/playwright.config.ts`: the virtual environment's interpreter is looked up in `Scripts/` too and passed as an absolute path. |
| `ModuleNotFoundError: notes_api` | Run from `backend/` with `PYTHONPATH=src`, or use the `make` targets. |
| `Address already in use` (8787 or 5173) | Another instance is running: `lsof -i :8787` and stop it. Vite uses `--strictPort` on purpose (the CORS/redirect origin must stay 5173). |
| Notes disappeared | The Local Demo keeps data in memory; restarting the backend resets it to the seed notes. |
| Browser shows a CORS error locally | Open the app as `http://localhost:5173` (or `127.0.0.1`); other hosts are not allowed. |
| `npm run test:e2e` cannot find a browser | `npx playwright install chromium` (CI does this). |
| "Configuration error" screen | `VITE_APP_MODE` or other variables missing: use `npm run dev` (demo) or create `frontend/.env.aws` (`make frontend-env`). |
| pytest tries to reach AWS | It must not: tests set fake credentials. Check you did not remove the `_aws_environment` fixture. |

## Deployment (expected first-run issues — none of these has been observed, the stack was never deployed)

| Symptom | Likely cause / fix |
|---|---|
| `InvalidClientTokenId` / `ExpiredToken` | Credentials invalid or expired: `aws sso login`, check `aws sts get-caller-identity`. |
| `UserPoolDomain` fails: domain already exists | The prefix is taken in the region: set `CognitoDomainPrefix` to something unique. |
| `UserPoolTier` / `ManagedLoginVersion` rejected | Older CloudFormation resource spec or account restrictions: remove those two properties (defaults then apply) and redeploy. |
| `Runtime python3.13 is not supported` | Use the newest Python runtime listed in the Lambda docs; change `Runtime` in `Globals`. |
| Stack stuck in `ROLLBACK_COMPLETE` | Delete it (`sam delete`) and deploy again; read the first `CREATE_FAILED` event for the reason. |
| `CloudWatch Logs role ARN must be set in account settings` | Only with `EnableApiAccessLogs=true` when the account role is missing/ordering problem: deploy once with `false`, then switch to `true`. |
| Changing `AllowedOrigin` has no effect on preflight | API Gateway needs a new deployment of the stage; SAM does this when the API definition changes — redeploy. |

## Runtime on AWS

| Symptom | Check |
|---|---|
| 401 on every call although signed in | Is the **access** token sent (not the ID token)? Does the token contain `notes/read`/`notes/write` in `scope` (decode it at jwt.io — never paste production tokens into websites you do not trust)? Tokens obtained by SDK password sign-in (`USER_SRP_AUTH`) do **not** carry custom scopes; use the hosted login flow. Is the token from the same user pool as the stack? |
| 403 `The access token does not grant the required scope` from Lambda although API Gateway let the request through | The function re-checks the `scope` claim passed by the authorizer (`security/identity.py::require_scope`). If the authorizer does not forward `scope` as expected, this defence-in-depth check is the first thing to inspect on a real deployment (log the claim *names*, never the token). |
| 403 with `{"message":"Missing Authentication Token"}`-like behaviour / 404 `No such route` | Wrong path or stage in the URL (`…/dev/notes`). |
| Browser: CORS error, curl works | Origin differs from `AllowedOrigin` (scheme, host and port must match exactly). |
| Hosted login: `redirect_mismatch` | `VITE_OAUTH_REDIRECT_URI` must equal one of `CallbackUrls` exactly. |
| Sign-up: no e-mail arrives | Spam folder; Cognito's default sender has a low daily limit; for real use configure SES. |
| 403 `FORBIDDEN` on your own note | You are signed in as a different user than the note's creator (compare `userId` with the "User id (sub)" on the Settings page). |
| 409 on save | The note changed elsewhere; reload it. |
| 429 | Throttle (10 req/s, burst 20, per method) exceeded; slow down or raise the parameters. |
| 500 `INTERNAL_ERROR` | Follow the investigation steps above. `AccessDeniedException` in the stack trace = the function's IAM policy does not allow the DynamoDB call. |
| 503 `SERVICE_UNAVAILABLE` | DynamoDB throttling or outage; see alarm `…-dynamodb-throttles`. |
| New note missing from the list for a moment | Index eventual consistency; reload. |
| Slow first request | Cold start; see `docs/performance/PERFORMANCE.md`. |

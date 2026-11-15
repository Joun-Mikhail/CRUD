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

## Local development

| Symptom | Cause / fix |
|---|---|
| Sign-in page: "The local backend is not reachable" | Start it: `make demo-backend`. Port 8787 must be free. |
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
| 429 | Stage throttle (10 req/s, burst 20) exceeded; slow down or raise the parameters. |
| 500 `INTERNAL_ERROR` | Follow the investigation steps above. `AccessDeniedException` in the stack trace = the function's IAM policy does not allow the DynamoDB call. |
| 503 `SERVICE_UNAVAILABLE` | DynamoDB throttling or outage; see alarm `…-dynamodb-throttles`. |
| New note missing from the list for a moment | Index eventual consistency; reload. |
| Slow first request | Cold start; see `docs/performance/PERFORMANCE.md`. |

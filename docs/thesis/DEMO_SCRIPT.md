# Demonstration script (about 10 minutes)

Before you start: sign in to the AWS console (region **Europe (Stockholm) eu-north-1**) and open these tabs. Use your own account for the app; never show tokens, the account ID or other people's e-mail addresses on screen.

| Tab | Where |
|---|---|
| App | https://d11c0a7q5fx9qi.cloudfront.net |
| DynamoDB | DynamoDB → Tables → `serverless-notes-dev-notes` → Explore table items |
| Lambda | Lambda → Functions (filter `serverless-notes-dev`) |
| API Gateway | API Gateway → `serverless-notes-dev-api` → Resources / Authorizers |
| CloudWatch | CloudWatch → Logs Insights (select the five `/aws/lambda/serverless-notes-dev-*` groups); Alarms |

If the app answers "too many requests" right after automated tests, wait a minute (stage throttle).

## 1. Open the live website (30 s)
Open the app tab. Say: static files come from a private S3 bucket through CloudFront over HTTPS; the browser talks directly to API Gateway.

## 2. Sign in (1 min)
Click sign-in → Cognito's hosted page → enter your credentials → you return to `/notes`. Say: authorization code flow with PKCE; the access token is kept only in memory, never in local storage.

## 3. Create a note (1 min)
Create a note "Demo note" with some content. Say: `POST /notes` → API Gateway checks the JWT and the `notes/write` scope → CreateNote Lambda validates and writes → 201.

## 4. Show it in DynamoDB (1 min)
DynamoDB tab → refresh → find the item. Point at `noteId` (partition key), `userId` (= your Cognito `sub`), `userSortKey`, `version = 1`. Open the **Indexes** tab: `byUser` (partition `userId`, sort `userSortKey`) — "listing is a Query on this index, never a Scan".

## 5. Update the note (1 min)
Edit the title, save. Back in DynamoDB: `version = 2`, new `updatedAt`. Say: the ownership check is inside the conditional `UpdateItem`; a stale version gives 409.

## 6. Delete the note (30 s)
Delete it in the app (confirm dialog) → the item disappears from the table. DELETE returns 200 as the assignment requires.

## 7. Explain the architecture (2 min)
Use Figure 4.1 of the report or the app's Architecture page: Browser → Cognito (tokens) → API Gateway (authorizer + scopes, throttling, CORS) → 5 Lambda functions (one IAM action each) → DynamoDB (table + GSI) → CloudWatch. In the Lambda tab show the five functions (Python 3.13, arm64); in API Gateway show the five routes and the Cognito authorizer.

## 8. Logs and evidence (2 min)
CloudWatch Logs Insights, last 15 minutes:
```
fields @timestamp, operation, status, errorCode, durationMs, requestId
| sort @timestamp desc | limit 20
```
Point out: one JSON line per request with the request id and duration, and **no note text, tokens or e-mail addresses**. Then show Alarms (four, state OK).

Finish with the test evidence on GitHub: `docs/testing/TESTING.md` (summary table), `evidence/tests/live-api-tests.json` (38/38), `evidence/benchmarks/aws-dev-eu-north-1.json` (median ≈ 120 ms).

## Optional: isolation (1 min, needs a second account)
In a private window sign in as a second user and open the first user's note URL → 403, shown as "This note belongs to another account". Show the screenshot `evidence/screenshots/aws-11-isolation-forbidden.png` instead if no second account is at hand.

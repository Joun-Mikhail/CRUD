# Logging, monitoring and reliability evaluation (2026-11-17)

Evidence: `evidence/aws/cloudwatch.txt` (first checks, request-id tracing, cold starts), `evidence/aws/bachelor-evaluation.json` (log groups, alarms, Lambda REPORT statistics and concurrency during the concurrency benchmark), `scripts/testing/collect_aws_evidence.py` (read-only collector).

## What is in place and what was verified

| Element | Configuration | Verified on AWS |
|---|---|---|
| Lambda log groups | five, `/aws/lambda/serverless-notes-dev-{create,list,get,update,delete}-note(s)`, retention **14 days** (created by the template, so retention is not "never expire") | all five present with 14-day retention (2026-11-17) |
| Structured request log | one JSON line per request: `requestId`, `operation`, `status`, `errorCode`, `errorCategory`, `durationMs`, `userId` (opaque `sub`); never titles, content, tokens, e-mail | Logs Insights grouped 729 benchmark requests by operation and status; no ERROR lines; no personal data found |
| Request-id tracing | the `requestId` in every error envelope = API Gateway request id = log field | a 403 shown in the UI was traced to its log line (`evidence/aws/cloudwatch.txt`) |
| Lambda platform metrics | `REPORT` lines: duration, init duration (cold start), memory | warm median 8–16 ms, max memory 93 MB / 256 MB, 11 cold starts during scale-out to 8 environments |
| Alarm `api-5xx` | `5XXError` sum ≥ 1 in 5 min | state OK, receives data |
| Alarm `api-latency-p95` | `Latency` p95 > 2,000 ms for 3 × 5 min | state OK |
| Alarm `lambda-errors` | metric math, sum of `Errors` of the five functions ≥ 1 in 5 min | state OK |
| Alarm `dynamodb-throttles` | metric math, throttled requests ≥ 1 in 5 min | state OK |
| Notification path | SNS topic + e-mail subscription only when the `AlarmEmail` parameter is set | **not configured on the dev stack** (`AlarmActions` empty) → an alarm would change state but notify nobody; **not verified** |
| API Gateway access logs | optional (`EnableApiAccessLogs`); off, because it needs an account-wide CloudWatch role | not used; requests rejected by the gateway are visible only in metrics |

No failure was injected deliberately to trigger alarms (it would require breaking the deployed stack). To verify the notification path: deploy with `AlarmEmail=<address>`, confirm the subscription e-mail, then run `aws cloudwatch set-alarm-state --alarm-name serverless-notes-dev-api-5xx --state-value ALARM --state-reason test` — the alarm returns to OK at the next evaluation. This costs nothing beyond the SNS free tier.

## Assessment against the assignment

The assignment asks for logging and monitoring. Both exist and work: every request is logged in a searchable, privacy-preserving form, individual requests can be traced from the client's error message, and the four alarms cover the failure classes of this architecture (gateway 5xx, latency, function errors, database throttling). The missing piece is a configured notification target, which is a deployment parameter rather than missing functionality. Not included and not needed at this scale: dashboards, X-Ray tracing, anomaly detection.

## Reliability and failure modes

| Failure | Behaviour | Client sees |
|---|---|---|
| DynamoDB throttling or a transient service error | boto3 retries with backoff (default retry configuration); if it still fails the repository raises `RepositoryError` | **503 `SERVICE_UNAVAILABLE`** — safe to retry; alarm `dynamodb-throttles` |
| Unexpected exception (bug) | caught by the HTTP wrapper, full stack trace logged with the request id | **500 `INTERNAL_ERROR`** without details; alarm `lambda-errors` |
| Lambda timeout (10 s) | invocation aborted by Lambda | 5xx from API Gateway; alarms `api-5xx`, `lambda-errors` |
| Too many requests | API Gateway throttles per method | **429 `THROTTLED`** with the error envelope |
| Concurrent edits of one note | conditional write with `version` | **409 `VERSION_CONFLICT`** — no lost update |
| Concurrent create with the same id | `attribute_not_exists(noteId)` | impossible to overwrite (UUIDs, condition) |
| Availability zone failure | API Gateway, Lambda and DynamoDB are regional multi-AZ services | transparent (provider guarantee, not tested) |
| Region failure | single-region deployment | outage; multi-region is future work |

**Persistence.** A successful 200/201 is returned only after DynamoDB acknowledged the write; DynamoDB stores data durably across three availability zones. `GET /notes/{id}` is strongly consistent, so a note is readable immediately after it was written; the list uses the GSI and is eventually consistent (normally well under a second). Writes are idempotent where it matters: retrying a PUT with the same content and no version yields the same note; a DELETE retried after success answers 404. The dev stack has **no point-in-time recovery**; the template enables it for `Stage=prod`.

**Retry guidance for clients:** retry 429 and 503 with exponential backoff; never retry 4xx validation errors; the web client retries a 401 once after refreshing the token.

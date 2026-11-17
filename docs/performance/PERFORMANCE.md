# Performance and scalability

> **Measured on AWS on 2026-11-17** (development stack, eu-north-1; sections "Measured on AWS" and "Concurrency benchmark on AWS"). The document also keeps the theoretical evaluation, one benchmark of the *local emulator* (not representative of AWS) and the procedure used for the measurements. Do not mix the local numbers with the AWS numbers.

## What determines the latency of one request

```
browser ──TLS──▶ API Gateway ──▶ authorizer ──▶ Lambda (init?) ──▶ handler ──▶ DynamoDB ──▶ back
   network          routing        JWT check      cold start         code         1 call
```

| Component | Typical order of magnitude (general AWS behaviour, not measured here) | What influences it |
|---|---|---|
| Network + TLS, client ↔ Stockholm | 10–60 ms from Central Europe; more on first connection | distance, connection reuse |
| API Gateway overhead | single-digit to low tens of ms | REST API features used |
| Cognito authorizer | small; public keys are cached by API Gateway | — |
| Lambda **cold start** (first request to a new execution environment) | hundreds of ms for a small Python function | package size, memory, imports (`boto3` import dominates) |
| Lambda warm invocation, handler code | a few ms | our code: JSON parse + validation |
| DynamoDB call from Lambda in the same region | single-digit ms | item size, consistency |

Expectation to test: warm requests dominated by network and gateway overhead; the first request after idle noticeably slower because of the cold start.

## Measured on AWS (2026-11-17)

Setup: stack `serverless-notes-dev`, eu-north-1, Lambda python3.13 arm64 256 MB; client on a home connection in Central Europe; `scripts/testing/benchmark.py`, 100 sequential cycles (POST → list → GET → PUT → DELETE = 500 requests) with a 100 ms pause; a **new TLS connection for every request**; the run started right after a deployment, so the first cycle hit one cold start per function. Raw data: `evidence/benchmarks/aws-dev-eu-north-1.json`, `evidence/aws/cloudwatch.txt`.

**Client view (ms, end to end):**

| Endpoint | n | Mean | Median | p95 | Max (= cold start) | Success |
|---|---|---|---|---|---|---|
| POST /notes | 100 | 131.6 | 121.05 | 141.6 | 807.63 | 100% |
| GET /notes | 100 | 138.25 | 119.41 | 149.27 | 949.14 | 100% |
| GET /notes/{id} | 100 | 135.4 | 118.8 | 145.82 | 768.55 | 100% |
| PUT /notes/{id} | 100 | 133.69 | 121.69 | 152.32 | 908.41 | 100% |
| DELETE /notes/{id} | 100 | 132.04 | 122.13 | 149.63 | 745.91 | 100% |

**Inside Lambda** (`REPORT` log lines, same run): warm handler duration median 10–14 ms, p95 ≈ 21–23 ms; maximum memory used 91–93 MB of 256 MB.

| Cold start | Init Duration | First request after init | Total in Lambda |
|---|---|---|---|
| before the fix (boto3 resource created on the first request) | 184–355 ms | ≈ 980–1,030 ms | ≈ 1.2–1.4 s |
| after `runtime.prewarm()` (resource created during init) | 386–524 ms | 141–170 ms | ≈ 0.55–0.69 s |

Interpretation:
- Warm requests: ≈ 120 ms seen by the client, of which ≈ 10–20 ms is Lambda; the rest is network, TLS set-up (a new connection per request in this script; a browser reuses its connection), API Gateway and the authorizer. Reusing connections would lower the client-side figure.
- Cold starts: creating the boto3 resource loads botocore's service model, which took about one second at 256 MB when it happened inside the first request. `runtime.prewarm()` now does it during the Lambda init phase; the user-visible cold start roughly halved. Raising the memory size would shorten it further (more CPU), at a higher price per GB-second.
- Throughput: the sequential client reached ≈ 6 requests per second, under the 10 req/s stage limit; all 500 requests succeeded.

## Concurrency benchmark on AWS (2026-11-17, bachelor-stage evaluation)

Script: `scripts/testing/concurrency_benchmark.py` (one temporary Cognito user, five seed notes, deleted afterwards; 429 recorded, never retried; hard caps 8 clients, 100 requests per level, 600 per run; automatic stop on any 5xx or network error). Client: one Windows workstation on a home connection in Central Europe, a new TLS connection per request. Workload: 50 % `GET /notes/{id}`, 30 % `GET /notes?limit=20`, 20 % `PUT /notes/{id}`, all on the caller's own notes. Raw data: `evidence/benchmarks/aws-concurrency-eu-north-1.json`, `aws-concurrency-throttle-eu-north-1.json`, `aws-throttle-single-method-eu-north-1.json`; Lambda side: `evidence/aws/bachelor-evaluation.json`. Figures and CSV tables: `docs/thesis/figures/`.

**Closed loop (clients send back to back), mixed workload, 60 requests per level:**

| Clients | Offered req/s | Success | 429 | Median ms | p95 ms | p99 ms* | Max ms |
|---|---|---|---|---|---|---|---|
| 1 | 6.8 | 60/60 | 0 | 119.7 | 191.3 | 647.6 | 926.7 (cold start) |
| 2 | 15.5 | 60/60 | 0 | 124.9 | 142.6 | 143.5 | 217.3 |
| 4 | 28.9 | 60/60 | 0 | 125.6 | 197.6 | 275.3 | 284.5 |
| 8 | 57.6 | 60/60 | 0 | 122.5 | 236.4 | 256.8 | 273.4 |
| 8 (second run, 100 requests) | 60.5 | 100/100 | 0 | 120.7 | 145.1 | 253.1 | 258.9 |
| 8, paced to 8 req/s (80 requests) | 8.0 | 80/80 | 0 | 120.6 | 150.2 | 175.7 | 207.7 |
| 4, paced to 20 req/s (100 requests) | 19.7 | 100/100 | 0 | 121.9 | 142.1 | 144.4 | 157.6 |

\* With 60–100 samples p99 is the largest or second-largest value; read it as "worst observed", not as a stable percentile.

**One method only (`GET /notes/{id}`), 100 requests per run:**

| Run | Offered req/s | Duration | 200 | 429 | Accepted req/s |
|---|---|---|---|---|---|
| 8 clients, unpaced | 58.8 | 1.7 s | 94 | 6 | 55.2 |
| 4 clients, paced to 20 req/s | 19.8 | 5.1 s | 83 | 17 | 16.4 |

**Lambda side for the whole window (19:05–19:14 UTC, CloudWatch REPORT lines):** 729 invocations; warm duration median 8–16 ms per function, p95 25–30 ms for the read/update functions; maximum memory 93 MB of 256 MB; **11 cold starts** (init 330–430 ms on average) as new execution environments were added; peak account `ConcurrentExecutions` (1-minute maximum) **8** of the account quota of 400; no Lambda error lines; the application logs show only 200/201 responses.

Interpretation:
- **Latency does not degrade with concurrency in the tested range.** The median stays at 120–126 ms from 1 to 8 clients and from 7 to 60 requests per second; only p95 widens (143–236 ms), caused by the cold starts of the new environments and by network variance. Inside Lambda a request takes about 10 ms, so the end-to-end time is dominated by the network path, TLS set-up and API Gateway.
- **Lambda scaled out as designed**: concurrency rose to 8 environments, each new one paying one cold start; nothing was queued or throttled by Lambda.
- **Throughput grew linearly with clients** (6.8 → 57.6 successful req/s), i.e. the backend was not the bottleneck at this level; the client's closed loop was.
- **The stage throttle is per method, not per stage.** The template sets `MethodSettings` for `/*` and `*`, which API Gateway applies to *each* method separately, each with its own bucket of 10 req/s and burst 20 (stage settings read with `apigateway get-stage`). The mixed workload spread its load over three methods and never hit a limit, even at 60 req/s for one second. With all requests on one method, 429 appeared: 6 % for a 1.7 s burst at 59 req/s and 17 % for 5 s at 20 req/s. The accepted rate (16.4 req/s over 5 s) is above the nominal 10 req/s + 20 burst ≈ 14 req/s, which is consistent with AWS describing throttling as best effort. The aggregate ceiling of the API with five methods is therefore roughly 5 × 10 = 50 req/s sustained, not 10 req/s as earlier documents stated.

What this does **not** show: behaviour at hundreds of concurrent users, DynamoDB partition limits, the account-level API Gateway limit (10,000 req/s, burst 5,000 in this account) or Lambda quota exhaustion. These remain architectural expectations (section "Scalability"); measuring them would require raising the throttle and a distributed load generator, i.e. new cost, and was deliberately not done.

## Scalability evaluation

| Layer | Limit that would be hit first | Evidence |
|---|---|---|
| API Gateway stage | 10 req/s + burst 20 **per method** (template parameter) | measured: 429 on a single method above ≈ 15 req/s |
| API Gateway account | 10,000 req/s, burst 5,000 (`apigateway get-account`) | configuration, not load-tested |
| Lambda | 400 concurrent executions in this account; each environment serves one request at a time; ≈ 10 ms per warm request → ≈ 100 req/s per environment in theory | measured: 8 environments, no throttles |
| DynamoDB on-demand | adapts automatically; per-partition ceilings ≈ 3,000 RCU / 1,000 WCU per second | access by key / per-user index; no `Scan` (test-enforced) |
| Cognito | per-account request quotas for sign-in and token operations (not relevant per API call: tokens are verified by API Gateway without calling Cognito) | documentation |

Conclusion: in the measured range the system scaled linearly with no latency penalty except cold starts; beyond it, the configured throttle — a deliberate cost guard — is the first limit, and the remaining limits are account quotas that can be raised. Large-scale scalability is argued from the managed services' documented behaviour, not demonstrated.

## Cold starts

A cold start happens when Lambda must create a new execution environment: after a deployment, after several minutes without traffic, or when concurrency rises. Each of the five functions has its own environments, so each can cold-start separately (cost of ADR 0003).

What this project does about it: no third-party packages in the deployment bundle; `boto3` resource created once per environment, during the init phase (`runtime.prewarm()`), and reused (`runtime.py`, `lru_cache`); 256 MB memory (more memory also means more CPU during init); arm64. Not used: provisioned concurrency or SnapStart — they remove cold starts but cost money continuously, which contradicts the low-cost goal; worth evaluating only if measurements show a problem.

## Concurrency and limits

- **Lambda** scales by running more environments in parallel, one request each. The account-level concurrency quota is 1,000 per region by default and can be lower for new accounts; this project's account has **400** in eu-north-1 (read on 2026-11-16). A burst of 120 concurrent list calls created 55 environments of `list-notes` without a single Lambda throttle.
- **API Gateway**: this stack throttles every method to 10 requests/s (burst 20) on purpose (the `*/*` method setting applies per method — measured 2026-11-17, see "Concurrency benchmark"), as a cost and abuse guard → `429 THROTTLED`. The account-level default is far higher (10,000 req/s). Integration timeout 29 s; our functions time out at 10 s. Payload limit 10 MB (the application allows 128 KiB; above 10 MB API Gateway answers 413 with a plain-text body and no CORS header, before any gateway response applies).
- **Measured throttling behaviour (2026-11-17)** — the limit is enforced approximately, as AWS documents ("best effort"):
  - requests rejected by the authorizer are not throttled: 60 concurrent unauthenticated requests → 60 × 401;
  - 60 concurrent authenticated list calls → no 429; bursts of 120 at ≈ 450 req/s → 15, 46, 84 and 125 of 240 throttled in different runs;
  - **after a burst, the burst method kept answering 429 to about half of the requests for several minutes, even at one request every 4 seconds**, while other methods were unaffected; it had recovered when the benchmark started about 10 minutes later. With limits as low as 10/20, one misbehaving client can therefore make listing unreliable for everybody for minutes. For real use, raise the limits (the stage limit protects cost, not individual users) and consider per-client usage plans.
- **DynamoDB on-demand** adapts to traffic automatically; a new table handles a few thousand request units per second immediately and grows as traffic doubles. Per-partition ceilings (≈3,000 read / 1,000 write units per second) matter only for one extremely hot key.
- **Stateless functions**: no data is kept in a function between requests, so any environment can serve any request — this is what makes horizontal scaling trivial. All state is in DynamoDB.

With default settings the first bottleneck is deliberately the throttle of 10 req/s per method; raise `ThrottlingRateLimit`/`ThrottlingBurstLimit` for load tests.

## Query efficiency and the effect of the index

| Operation | Work done | Grows with |
|---|---|---|
| Get/Update/Delete by id | one item addressed by its partition key | nothing (constant) |
| List (this implementation) | `Query` on `byUser`: reads at most `limit` items of **one** user | page size only |
| List (semestral report: scan + filter) | reads **every** note of **every** user, 1 MB per call, discards most | total table size |

Example: 1,000 users × 100 notes of 1 KB = 100,000 items ≈ 100 MB. One list call by scan must read all 100 MB (≈ 100 paginated calls, ≈ 12,500 read units eventually consistent). The same call by index query for a 20-note page reads ≈ 20 KB (≈ 3 read units). The index turns the list from O(table) into O(page).

## Local emulator benchmark (NOT AWS)

`evidence/benchmarks/local-demo-benchmark.json` — 100 sequential cycles against `local_demo.server` (Python `http.server` + `moto`, same machine, loopback network):

| Endpoint | n | mean ms | median ms | p95 ms | success |
|---|---|---|---|---|---|
| POST /notes | 100 | 2.90 | 2.48 | 3.72 | 100 % |
| GET /notes | 100 | 3.09 | 2.97 | 3.99 | 100 % |
| GET /notes/{id} | 100 | 2.84 | 2.60 | 3.49 | 100 % |
| PUT /notes/{id} | 100 | 5.13 | 4.35 | 7.37 | 100 % |
| DELETE /notes/{id} | 100 | 2.60 | 2.38 | 4.01 | 100 % |

What this shows: the application code path (parsing, validation, service, repository calls) costs a few milliseconds and has no pathological step. What it does **not** show: network, TLS, API Gateway, the authorizer, cold starts, or real DynamoDB — i.e. everything that dominates on AWS.

## How to measure the deployed system

1. Deploy (`docs/deployment/DEPLOYMENT.md`). For more than light testing, raise the throttle parameters.
2. Obtain an access token without printing it: create a temporary user with `admin-create-user`, sign it in with `hosted_ui_login()` from `scripts/testing/live_api_tests.py` and pass the token to the benchmark through the `NOTES_ACCESS_TOKEN` environment variable (this is how the 2026-11-17 run was done; delete the user afterwards). An OAuth client such as Postman with PKCE also works.
3. Warm measurement, sequential, bounded (hard cap 500 cycles = 2,500 requests ≈ well under one cent):
   ```bash
   backend/.venv/bin/python scripts/testing/benchmark.py --base-url "$API" --cycles 200 \
       --label "aws-dev eu-north-1 warm" --output evidence/benchmarks/aws-warm.json
   ```
4. Cold start: wait ≥ 15 minutes without traffic, run with `--cycles 1`, repeat 5–10 times; compare with the warm median. Lambda's `REPORT` log line shows `Init Duration` on cold starts:
   ```
   filter @type = "REPORT" | stats count(), avg(@duration), pct(@duration,95), avg(@initDuration), max(@maxMemoryUsed) by @log
   ```
5. Server-side view: CloudWatch metrics `AWS/ApiGateway` `Latency` and `IntegrationLatency` (p50/p95), `AWS/Lambda` `Duration`; the application's own `durationMs` in the JSON logs.
6. Report: date, region, client location, memory size, number of requests, mean/median/p95, success rate, cold vs warm. Record the benchmark JSON files in `evidence/benchmarks/`.

Concurrent load tests (e.g. with `hey` or `k6`) are deliberately not scripted here: on a new account they hit the Lambda concurrency quota and the stage throttle immediately and can generate cost. If you run one, keep it short, raise the limits knowingly, and watch the bill.

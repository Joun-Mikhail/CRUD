# Performance and scalability

> **Measured on AWS on 2026-11-17** (development stack, eu-north-1; section "Measured on AWS"). The document also keeps the theoretical evaluation, one benchmark of the *local emulator* (not representative of AWS) and the procedure used for the measurements. Do not mix the local numbers with the AWS numbers.

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

## Cold starts

A cold start happens when Lambda must create a new execution environment: after a deployment, after several minutes without traffic, or when concurrency rises. Each of the five functions has its own environments, so each can cold-start separately (cost of ADR 0003).

What this project does about it: no third-party packages in the deployment bundle; `boto3` resource created once per environment, during the init phase (`runtime.prewarm()`), and reused (`runtime.py`, `lru_cache`); 256 MB memory (more memory also means more CPU during init); arm64. Not used: provisioned concurrency or SnapStart — they remove cold starts but cost money continuously, which contradicts the low-cost goal; worth evaluating only if measurements show a problem.

## Concurrency and limits

- **Lambda** scales by running more environments in parallel, one request each. The account-level concurrency quota is 1,000 per region by default and can be lower for new accounts; this project's account has **400** in eu-north-1 (read on 2026-11-16). A burst of 120 concurrent list calls created 55 environments of `list-notes` without a single Lambda throttle.
- **API Gateway**: this stack throttles the stage to 10 requests/s (burst 20) on purpose, as a cost and abuse guard → `429 THROTTLED`. The account-level default is far higher (10,000 req/s). Integration timeout 29 s; our functions time out at 10 s. Payload limit 10 MB (the application allows 128 KiB; above 10 MB API Gateway answers 413 with a plain-text body and no CORS header, before any gateway response applies).
- **Measured throttling behaviour (2026-11-17)** — the limit is enforced approximately, as AWS documents ("best effort"):
  - requests rejected by the authorizer are not throttled: 60 concurrent unauthenticated requests → 60 × 401;
  - 60 concurrent authenticated list calls → no 429; bursts of 120 at ≈ 450 req/s → 15, 46, 84 and 125 of 240 throttled in different runs;
  - **after a burst, the burst method kept answering 429 to about half of the requests for several minutes, even at one request every 4 seconds**, while other methods were unaffected; it had recovered when the benchmark started about 10 minutes later. With limits as low as 10/20, one misbehaving client can therefore make listing unreliable for everybody for minutes. For real use, raise the limits (the stage limit protects cost, not individual users) and consider per-client usage plans.
- **DynamoDB on-demand** adapts to traffic automatically; a new table handles a few thousand request units per second immediately and grows as traffic doubles. Per-partition ceilings (≈3,000 read / 1,000 write units per second) matter only for one extremely hot key.
- **Stateless functions**: no data is kept in a function between requests, so any environment can serve any request — this is what makes horizontal scaling trivial. All state is in DynamoDB.

With default settings the first bottleneck is deliberately the 10 req/s stage throttle; raise `ThrottlingRateLimit`/`ThrottlingBurstLimit` for load tests.

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

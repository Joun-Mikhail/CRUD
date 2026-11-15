# Performance and scalability

> **No measurement has been taken on AWS.** The stack was never deployed. This document is (1) a theoretical evaluation based on how the services work, (2) one benchmark of the *local emulator*, clearly not representative of AWS, and (3) a reproducible procedure for measuring the real system. Do not put the local numbers into the thesis as AWS results.

## What determines the latency of one request

```
browser ──TLS──▶ API Gateway ──▶ authorizer ──▶ Lambda (init?) ──▶ handler ──▶ DynamoDB ──▶ back
   network          routing        JWT check      cold start         code         1 call
```

| Component | Typical order of magnitude (general AWS behaviour, not measured here) | What influences it |
|---|---|---|
| Network + TLS, client ↔ Frankfurt | 10–60 ms from Central Europe; more on first connection | distance, connection reuse |
| API Gateway overhead | single-digit to low tens of ms | REST API features used |
| Cognito authorizer | small; public keys are cached by API Gateway | — |
| Lambda **cold start** (first request to a new execution environment) | hundreds of ms for a small Python function | package size, memory, imports (`boto3` import dominates) |
| Lambda warm invocation, handler code | a few ms | our code: JSON parse + validation |
| DynamoDB call from Lambda in the same region | single-digit ms | item size, consistency |

Expectation to test: warm requests dominated by network and gateway overhead; the first request after idle noticeably slower because of the cold start.

## Cold starts

A cold start happens when Lambda must create a new execution environment: after a deployment, after several minutes without traffic, or when concurrency rises. Each of the five functions has its own environments, so each can cold-start separately (cost of ADR 0003).

What this project does about it: no third-party packages in the deployment bundle; `boto3` resource created once per environment and reused (`runtime.py`, `lru_cache`); 256 MB memory (more memory also means more CPU during init); arm64. Not used: provisioned concurrency or SnapStart — they remove cold starts but cost money continuously, which contradicts the low-cost goal; worth evaluating only if measurements show a problem.

## Concurrency and limits

- **Lambda** scales by running more environments in parallel, one request each. The account-level concurrency quota is 1,000 per region by default — but new accounts are often limited to as few as 10 until a quota increase is requested. Beyond the limit, API Gateway returns errors (429/5xx).
- **API Gateway**: this stack throttles the stage to 10 requests/s (burst 20) on purpose, as a cost and abuse guard → `429 THROTTLED`. The account-level default is far higher (10,000 req/s). Integration timeout 29 s; our functions time out at 10 s. Payload limit 10 MB (the application allows 128 KiB).
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
2. Obtain an access token (e.g. temporarily print it in `scripts/testing/live_api_tests.py`, or use an OAuth client such as Postman with PKCE) and export it: `export NOTES_ACCESS_TOKEN=…`.
3. Warm measurement, sequential, bounded (hard cap 500 cycles = 2,500 requests ≈ well under one cent):
   ```bash
   backend/.venv/bin/python scripts/testing/benchmark.py --base-url "$API" --cycles 200 \
       --label "aws-dev eu-central-1 warm" --output evidence/benchmarks/aws-warm.json
   ```
4. Cold start: wait ≥ 15 minutes without traffic, run with `--cycles 1`, repeat 5–10 times; compare with the warm median. Lambda's `REPORT` log line shows `Init Duration` on cold starts:
   ```
   filter @type = "REPORT" | stats count(), avg(@duration), pct(@duration,95), avg(@initDuration), max(@maxMemoryUsed) by @log
   ```
5. Server-side view: CloudWatch metrics `AWS/ApiGateway` `Latency` and `IntegrationLatency` (p50/p95), `AWS/Lambda` `Duration`; the application's own `durationMs` in the JSON logs.
6. Report: date, region, client location, memory size, number of requests, mean/median/p95, success rate, cold vs warm. Record the benchmark JSON files in `evidence/benchmarks/`.

Concurrent load tests (e.g. with `hey` or `k6`) are deliberately not scripted here: on a new account they hit the Lambda concurrency quota and the stage throttle immediately and can generate cost. If you run one, keep it short, raise the limits knowingly, and watch the bill.

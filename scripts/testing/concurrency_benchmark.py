#!/usr/bin/env python3
"""Small, bounded concurrency benchmark against a DEPLOYED stack (standard library + boto3).

    python scripts/testing/concurrency_benchmark.py --stack-name serverless-notes-dev \
        --output evidence/benchmarks/aws-concurrency-eu-north-1.json

Design (bachelor-thesis evaluation, 2026-11-17):
  * One throw-away Cognito user (admin API, random password, never printed) signs in through
    the hosted UI (Authorization Code + PKCE, see live_api_tests.py). The user is deleted at
    the end, together with the notes it created.
  * Five seed notes are created. Every measured request is a read/update of the caller's own
    notes: 50 % GET /notes/{id}, 30 % GET /notes, 20 % PUT /notes/{id} (no version).
  * Phase "closed": for each concurrency level (default 1, 2, 4, 8) a fixed number of
    requests is shared by N client threads that send back to back (no pacing). This shows
    where the stage throttle (default 10 req/s, burst 20) starts answering 429.
  * Phase "paced": N clients together limited to a target rate below the throttle, to see
    the latency under concurrent requests when no throttling occurs.
  * Stage method settings `*/*` give every method its own bucket; --only-get sends a single
    method to measure the 429 behaviour of one bucket.
  * 429 is recorded, never retried. Hard caps: 100 requests per level, 8 clients,
    600 requests in total. The run stops early on any 5xx/network error, or skips the
    remaining closed levels when more than 60 % of a level's requests were throttled.

Credentials: as live_api_tests.py (export short-lived credentials for an `aws login` profile).
"""

from __future__ import annotations

import argparse
import json
import os
import random
import secrets
import statistics
import sys
import threading
import time
import urllib.error
import urllib.request
from collections import Counter
from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import boto3

sys.path.insert(0, str(Path(__file__).resolve().parent))
from live_api_tests import hosted_ui_login, random_password

MAX_PER_LEVEL = 100
MAX_CLIENTS = 8
MAX_TOTAL = 600


def call(base: str, method: str, path: str, token: str, body: Any = None) -> tuple[int, Any, float]:
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(
        base + path, data=data, method=method,
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
    )
    started = time.perf_counter()
    try:
        with urllib.request.urlopen(req, timeout=30) as response:
            raw, status = response.read(), response.status
    except urllib.error.HTTPError as error:
        raw, status = error.read(), error.code
    except (urllib.error.URLError, TimeoutError):
        return 0, None, (time.perf_counter() - started) * 1000
    elapsed = (time.perf_counter() - started) * 1000
    try:
        return status, json.loads(raw) if raw else None, elapsed
    except ValueError:
        return status, None, elapsed


def pct(values: list[float], q: float) -> float | None:
    if not values:
        return None
    ordered = sorted(values)
    return round(ordered[min(len(ordered) - 1, max(0, round(q * len(ordered)) - 1))], 1)


def summarise(label: str, clients: int, rows: list[dict[str, Any]], wall_s: float) -> dict[str, Any]:
    ok = [r["ms"] for r in rows if 200 <= r["status"] < 300]
    statuses = Counter(str(r["status"]) for r in rows)
    return {
        "phase": label, "clients": clients, "requests": len(rows), "wallSeconds": round(wall_s, 2),
        "statusCounts": dict(sorted(statuses.items())),
        "successRate": round(len(ok) / len(rows), 3) if rows else None,
        "throttledRate": round(statuses.get("429", 0) / len(rows), 3) if rows else None,
        "offeredRps": round(len(rows) / wall_s, 2) if wall_s else None,
        "successfulRps": round(len(ok) / wall_s, 2) if wall_s else None,
        "latencyMs2xx": {"n": len(ok), "median": pct(ok, 0.5), "p95": pct(ok, 0.95),
                         "p99": pct(ok, 0.99), "max": round(max(ok), 1) if ok else None,
                         "mean": round(statistics.fmean(ok), 1) if ok else None},
        "note": "p99 with fewer than 100 samples is the maximum or close to it" if len(ok) < 100 else "",
    }


def run_level(base: str, token: str, note_ids: list[str], clients: int, total: int,
              target_rps: float | None, label: str, only_get: bool = False) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    rows: list[dict[str, Any]] = []
    lock = threading.Lock()
    counter = iter(range(total))
    interval = clients / target_rps if target_rps else 0.0  # per-client pacing
    t0 = time.perf_counter()

    def worker(worker_id: int) -> None:
        rnd = random.Random(worker_id)
        next_at = time.perf_counter() + (worker_id * interval / clients if interval else 0)
        while True:
            with lock:
                index = next(counter, None)
            if index is None:
                return
            if interval:
                delay = next_at - time.perf_counter()
                if delay > 0:
                    time.sleep(delay)
                next_at += interval
            roll, note = (0.0 if only_get else rnd.random()), rnd.choice(note_ids)
            if roll < 0.5:
                op, (status, _b, ms) = "get", call(base, "GET", f"/notes/{note}", token)
            elif roll < 0.8:
                op, (status, _b, ms) = "list", call(base, "GET", "/notes?limit=20", token)
            else:
                op, (status, _b, ms) = "put", call(base, "PUT", f"/notes/{note}", token,
                                                   {"title": "Benchmark note", "content": f"rev {index}"})
            with lock:
                rows.append({"phase": label, "clients": clients, "op": op, "status": status,
                             "ms": round(ms, 2), "t": round(time.perf_counter() - t0, 3)})

    with ThreadPoolExecutor(max_workers=clients) as pool:
        for future in [pool.submit(worker, i) for i in range(clients)]:
            future.result()
    return summarise(label, clients, rows, time.perf_counter() - t0), rows


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawTextHelpFormatter)
    parser.add_argument("--stack-name", default="serverless-notes-dev")
    parser.add_argument("--region", default=os.environ.get("AWS_REGION", "eu-north-1"))
    parser.add_argument("--redirect-uri", default="http://localhost:5173/auth/callback")
    parser.add_argument("--levels", default="1,2,4,8")
    parser.add_argument("--per-level", type=int, default=60)
    parser.add_argument("--paced-clients", type=int, default=8)
    parser.add_argument("--paced-rps", type=float, default=8.0)
    parser.add_argument("--paced-requests", type=int, default=80)
    parser.add_argument("--rest-seconds", type=int, default=30, help="pause between levels")
    parser.add_argument("--only-get", action="store_true",
                        help="send only GET /notes/{id} (one method, one throttle bucket)")
    parser.add_argument("--output", default="evidence/benchmarks/aws-concurrency-eu-north-1.json")
    args = parser.parse_args()

    levels = [int(x) for x in args.levels.split(",")]
    if max(levels + [args.paced_clients]) > MAX_CLIENTS or args.per_level > MAX_PER_LEVEL \
            or args.paced_requests > MAX_PER_LEVEL \
            or len(levels) * args.per_level + args.paced_requests > MAX_TOTAL:
        raise SystemExit("Refusing: above the hard caps (8 clients, 100 per level, 600 total)")

    stack = boto3.client("cloudformation", region_name=args.region).describe_stacks(
        StackName=args.stack_name)["Stacks"][0]
    out = {o["OutputKey"]: o["OutputValue"] for o in stack["Outputs"]}
    base, pool_id = out["ApiBaseUrl"], out["UserPoolId"]
    cognito = boto3.client("cognito-idp", region_name=args.region)
    email = f"bench-{secrets.token_hex(4)}@example.com"
    password = random_password()

    summaries: list[dict[str, Any]] = []
    all_rows: list[dict[str, Any]] = []
    note_ids: list[str] = []
    stopped_reason = None
    started_at = datetime.now(UTC).isoformat(timespec="seconds")
    try:
        cognito.admin_create_user(UserPoolId=pool_id, Username=email, MessageAction="SUPPRESS",
                                  UserAttributes=[{"Name": "email", "Value": email},
                                                  {"Name": "email_verified", "Value": "true"}])
        cognito.admin_set_user_password(UserPoolId=pool_id, Username=email, Password=password,
                                        Permanent=True)
        token = hosted_ui_login(out["CognitoDomain"], out["UserPoolClientId"], args.redirect_uri,
                                email, password)["access_token"]
        for i in range(5):
            status, body, _ms = call(base, "POST", "/notes", token,
                                     {"title": f"Benchmark seed {i}", "content": "seed"})
            if status != 201:
                raise SystemExit(f"Seeding failed with HTTP {status}")
            note_ids.append(body["data"]["noteId"])
        time.sleep(args.rest_seconds)

        for clients in levels:
            summary, rows = run_level(base, token, note_ids, clients, args.per_level, None, "closed",
                                     args.only_get)
            summaries.append(summary)
            all_rows += rows
            print(json.dumps({k: summary[k] for k in ("clients", "statusCounts", "successfulRps",
                                                     "latencyMs2xx")}))
            if any(r["status"] == 0 or r["status"] >= 500 for r in rows):
                stopped_reason = f"5xx or network error at {clients} clients"
                break
            if summary["throttledRate"] > 0.6:
                stopped_reason = f"more than 60 % throttled at {clients} clients; higher levels skipped"
                break
            time.sleep(args.rest_seconds)

        if not stopped_reason or "throttled" in stopped_reason:
            time.sleep(args.rest_seconds)
            summary, rows = run_level(base, token, note_ids, args.paced_clients,
                                      args.paced_requests, args.paced_rps, "paced",
                                      args.only_get)
            summary["targetRps"] = args.paced_rps
            summaries.append(summary)
            all_rows += rows
            print(json.dumps({k: summary[k] for k in ("clients", "statusCounts", "successfulRps",
                                                     "latencyMs2xx")}))
    finally:
        for note in note_ids:
            for _attempt in range(5):
                if call(base, "DELETE", f"/notes/{note}", token)[0] != 429:
                    break
                time.sleep(2)
        try:
            cognito.admin_delete_user(UserPoolId=pool_id, Username=email)
        except cognito.exceptions.UserNotFoundException:
            pass

    report = {
        "stack": args.stack_name, "region": args.region, "startedAt": started_at,
        "finishedAt": datetime.now(UTC).isoformat(timespec="seconds"),
        "client": "one Windows workstation, home connection in Central Europe, Python urllib "
                  "(new TLS connection per request)",
        "mix": "100 % GET /notes/{id}" if args.only_get
        else "50 % GET /notes/{id}, 30 % GET /notes?limit=20, 20 % PUT /notes/{id}",
        "stageThrottle": "10 req/s, burst 20 (template defaults)",
        "stoppedReason": stopped_reason, "summaries": summaries, "requests": all_rows,
        "cleanup": "seed notes and the temporary user deleted",
    }
    Path(args.output).parent.mkdir(parents=True, exist_ok=True)
    Path(args.output).write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {args.output}")


if __name__ == "__main__":
    main()

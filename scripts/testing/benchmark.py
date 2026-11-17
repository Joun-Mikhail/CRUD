#!/usr/bin/env python3
"""Bounded latency benchmark for the five endpoints (standard library only).

Runs a fixed number of sequential request cycles (POST -> GET list -> GET one -> PUT ->
DELETE), so it cleans up after itself and cannot run away. Hard cap: 500 cycles.

Local demo:  python scripts/testing/benchmark.py --base-url http://127.0.0.1:8787 --demo-user alice
AWS:         NOTES_ACCESS_TOKEN=<access token> python scripts/testing/benchmark.py \
                 --base-url https://<api-id>.execute-api.eu-north-1.amazonaws.com/dev

Numbers measured against the local demo describe your laptop, NOT AWS. Only publish AWS
figures you measured on a deployed stack.
"""

from __future__ import annotations

import argparse
import json
import os
import statistics
import sys
import time
import urllib.error
import urllib.request
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

MAX_CYCLES = 500


def request(base_url: str, method: str, path: str, auth: str, body: Any = None) -> tuple[int, Any, float]:
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(  # noqa: S310 - URL is supplied by the operator
        base_url + path,
        data=data,
        method=method,
        headers={"Authorization": auth, "Content-Type": "application/json"},
    )
    started = time.perf_counter()
    try:
        with urllib.request.urlopen(req, timeout=30) as response:  # noqa: S310
            raw, status = response.read(), response.status
    except urllib.error.HTTPError as error:
        raw, status = error.read(), error.code
    elapsed_ms = (time.perf_counter() - started) * 1000
    try:
        parsed = json.loads(raw) if raw else None
    except ValueError:
        parsed = None
    return status, parsed, elapsed_ms


def percentile(values: list[float], fraction: float) -> float:
    ordered = sorted(values)
    index = min(len(ordered) - 1, max(0, round(fraction * len(ordered)) - 1))
    return ordered[index]


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawTextHelpFormatter)
    parser.add_argument("--base-url", required=True)
    parser.add_argument("--demo-user", help="local demo identity (alice/bob/carol)")
    parser.add_argument("--cycles", type=int, default=50)
    parser.add_argument("--pause-ms", type=int, default=0, help="pause between cycles")
    parser.add_argument("--label", default="unlabelled", help="environment label for the report")
    parser.add_argument("--output", help="write the JSON report to this file")
    args = parser.parse_args()

    if not 1 <= args.cycles <= MAX_CYCLES:
        sys.exit(f"--cycles must be between 1 and {MAX_CYCLES}")
    token = os.environ.get("NOTES_ACCESS_TOKEN")
    if args.demo_user:
        auth = f"Demo {args.demo_user}"
    elif token:
        auth = f"Bearer {token}"
    else:
        sys.exit("Provide --demo-user (local demo) or NOTES_ACCESS_TOKEN (AWS).")
    base_url = args.base_url.rstrip("/")

    expected = {"POST /notes": 201, "GET /notes": 200, "GET /notes/{id}": 200,
                "PUT /notes/{id}": 200, "DELETE /notes/{id}": 200}
    timings: dict[str, list[float]] = {name: [] for name in expected}
    failures: dict[str, int] = dict.fromkeys(expected, 0)

    def record(name: str, status: int, elapsed: float) -> None:
        timings[name].append(elapsed)
        if status != expected[name]:
            failures[name] += 1

    for cycle in range(args.cycles):
        status, body, ms = request(base_url, "POST", "/notes", auth,
                                   {"title": f"benchmark {cycle}", "content": "x" * 200})
        record("POST /notes", status, ms)
        if status != 201:
            continue
        note_id = body["data"]["noteId"]
        status, _, ms = request(base_url, "GET", "/notes?limit=20", auth)
        record("GET /notes", status, ms)
        status, _, ms = request(base_url, "GET", f"/notes/{note_id}", auth)
        record("GET /notes/{id}", status, ms)
        status, _, ms = request(base_url, "PUT", f"/notes/{note_id}", auth,
                                {"title": "benchmark updated", "content": "y" * 200})
        record("PUT /notes/{id}", status, ms)
        status, _, ms = request(base_url, "DELETE", f"/notes/{note_id}", auth)
        record("DELETE /notes/{id}", status, ms)
        if args.pause_ms:
            time.sleep(args.pause_ms / 1000)

    report: dict[str, Any] = {
        "label": args.label,
        "baseUrl": base_url,
        "measuredAt": datetime.now(UTC).isoformat(timespec="seconds"),
        "cycles": args.cycles,
        "concurrency": 1,
        "results": {},
    }
    print(f"{'endpoint':<22}{'n':>5}{'mean':>9}{'median':>9}{'p95':>9}{'max':>9}{'success':>10}")
    for name, values in timings.items():
        if not values:
            continue
        ok = len(values) - failures[name]
        row = {
            "requests": len(values),
            "meanMs": round(statistics.fmean(values), 2),
            "medianMs": round(statistics.median(values), 2),
            "p95Ms": round(percentile(values, 0.95), 2),
            "maxMs": round(max(values), 2),
            "successRate": round(ok / len(values), 4),
            "errorRate": round(failures[name] / len(values), 4),
        }
        report["results"][name] = row
        print(f"{name:<22}{row['requests']:>5}{row['meanMs']:>9}{row['medianMs']:>9}"
              f"{row['p95Ms']:>9}{row['maxMs']:>9}{row['successRate']:>10.2%}")
    if args.output:
        Path(args.output).write_text(json.dumps(report, indent=2) + "\n")
        print(f"Report written to {args.output}")
    if any(failures.values()):
        sys.exit(1)


if __name__ == "__main__":
    main()

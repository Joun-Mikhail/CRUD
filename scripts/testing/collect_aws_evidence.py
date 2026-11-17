#!/usr/bin/env python3
"""Read-only collection of monitoring, Lambda and billing evidence for the thesis evaluation.

    python scripts/testing/collect_aws_evidence.py --start 2026-11-17T19:05:00Z \
        --end 2026-11-17T19:14:00Z --output evidence/aws/bachelor-evaluation.json

Reads: Lambda REPORT lines (CloudWatch Logs Insights) for the benchmark window, the account's
ConcurrentExecutions metric, log-group retention, alarm configuration and state, and Cost
Explorer (two GetCostAndUsage calls, USD 0.01 each). Writes no AWS resource. The account ID is
removed from the output.
"""

from __future__ import annotations

import argparse
import json
import re
import time
from datetime import UTC, date, datetime, timedelta
from pathlib import Path
from typing import Any

import boto3

PREFIX = "serverless-notes-dev"


def iso(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def insights(logs: Any, groups: list[str], start: datetime, end: datetime, query: str) -> list[dict[str, str]]:
    qid = logs.start_query(logGroupNames=groups, startTime=int(start.timestamp()),
                           endTime=int(end.timestamp()), queryString=query)["queryId"]
    for _ in range(60):
        result = logs.get_query_results(queryId=qid)
        if result["status"] in ("Complete", "Failed", "Cancelled"):
            return [{f["field"]: f["value"] for f in row} for row in result["results"]]
        time.sleep(1)
    raise RuntimeError("Logs Insights query timed out")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--region", default="eu-north-1")
    parser.add_argument("--start", required=True)
    parser.add_argument("--end", required=True)
    parser.add_argument("--skip-billing", action="store_true")
    parser.add_argument("--output", default="evidence/aws/bachelor-evaluation.json")
    args = parser.parse_args()
    start, end = iso(args.start), iso(args.end)

    logs = boto3.client("logs", region_name=args.region)
    cloudwatch = boto3.client("cloudwatch", region_name=args.region)
    report: dict[str, Any] = {"collectedAt": datetime.now(UTC).isoformat(timespec="seconds"),
                              "window": [args.start, args.end]}

    groups = logs.describe_log_groups(logGroupNamePrefix=f"/aws/lambda/{PREFIX}")["logGroups"]
    names = [g["logGroupName"] for g in groups]
    report["logGroups"] = [{"name": g["logGroupName"], "retentionDays": g.get("retentionInDays"),
                            "storedBytes": g.get("storedBytes")} for g in groups]

    report["lambdaReport"] = insights(logs, names, start, end, (
        'filter @type = "REPORT" | stats count() as invocations, '
        "pct(@duration, 50) as p50ms, pct(@duration, 95) as p95ms, pct(@duration, 99) as p99ms, "
        "max(@duration) as maxms, count(@initDuration) as coldStarts, "
        "avg(@initDuration) as avgInitMs, max(@maxMemoryUsed / 1000 / 1000) as maxMemMB by @log"))
    report["requestLogsByStatus"] = insights(logs, names, start, end, (
        "filter ispresent(status) | stats count() as n, pct(durationMs, 50) as p50ms, "
        "pct(durationMs, 95) as p95ms by operation, status"))
    report["errorLines"] = insights(logs, names, start, end,
                                    'filter level = "ERROR" | stats count() as n')

    metric = cloudwatch.get_metric_statistics(
        Namespace="AWS/Lambda", MetricName="ConcurrentExecutions", StartTime=start,
        EndTime=end, Period=60, Statistics=["Maximum"])
    report["accountConcurrentExecutionsMax1min"] = sorted(
        (p["Timestamp"].isoformat(), p["Maximum"]) for p in metric["Datapoints"])
    report["lambdaAccountLimit"] = boto3.client("lambda", region_name=args.region) \
        .get_account_settings()["AccountLimit"]["ConcurrentExecutions"]

    alarms = cloudwatch.describe_alarms(AlarmNamePrefix=PREFIX)["MetricAlarms"]
    report["alarms"] = [{
        "name": a["AlarmName"], "state": a["StateValue"], "actionsEnabled": a["ActionsEnabled"],
        "alarmActions": len(a.get("AlarmActions", [])), "threshold": a["Threshold"],
        "evaluationPeriods": a["EvaluationPeriods"], "comparison": a["ComparisonOperator"],
        "metric": a.get("MetricName") or "metric math",
        "treatMissingData": a.get("TreatMissingData"),
        "stateUpdated": a["StateUpdatedTimestamp"].isoformat()} for a in alarms]

    if not args.skip_billing:
        ce = boto3.client("ce", region_name="us-east-1")
        period = {"Start": "2026-10-01", "End": (date.today() + timedelta(days=1)).isoformat()}
        by_service = ce.get_cost_and_usage(
            TimePeriod=period, Granularity="MONTHLY", Metrics=["UnblendedCost"],
            Filter={"Dimensions": {"Key": "RECORD_TYPE", "Values": ["Usage"]}},
            GroupBy=[{"Type": "DIMENSION", "Key": "SERVICE"}])
        by_record = ce.get_cost_and_usage(
            TimePeriod=period, Granularity="MONTHLY", Metrics=["UnblendedCost"],
            GroupBy=[{"Type": "DIMENSION", "Key": "RECORD_TYPE"}])

        def flatten(resp: dict[str, Any]) -> list[dict[str, Any]]:
            return [{"month": r["TimePeriod"]["Start"][:7], "key": g["Keys"][0],
                     "usd": round(float(g["Metrics"]["UnblendedCost"]["Amount"]), 4)}
                    for r in resp["ResultsByTime"] for g in r["Groups"]]

        report["costExplorer"] = {"note": "UnblendedCost; Usage = gross list-price usage before credits",
                                  "period": period, "usageByService": flatten(by_service),
                                  "byRecordType": flatten(by_record)}

    text = json.dumps(report, indent=2, default=str)
    text = re.sub(r"\b\d{12}\b", "<account-id>", text)
    Path(args.output).parent.mkdir(parents=True, exist_ok=True)
    Path(args.output).write_text(text + "\n", encoding="utf-8")
    print(text[:6000])


if __name__ == "__main__":
    main()

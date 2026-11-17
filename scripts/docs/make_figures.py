"""Thesis figures from the recorded evidence (static PNG for print + CSV table view).

    uv run --no-project --with matplotlib python scripts/docs/make_figures.py

Inputs: evidence/benchmarks/aws-concurrency-eu-north-1.json,
evidence/benchmarks/aws-throttle-single-method-eu-north-1.json, evidence/aws/bachelor-evaluation.json
and the list-price scenarios of AWS_COST_ANALYSIS.md. Output: docs/thesis/figures/.
Palette: categorical slots 1-2 (#2a78d6, #eb6834), validated for light surfaces and CVD.
"""

from __future__ import annotations

import csv
import json
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "docs" / "thesis" / "figures"
BLUE, ORANGE, INK, MUTED, GRID = "#2a78d6", "#eb6834", "#1f1f1e", "#5f5e58", "#e4e3df"


def style(ax: plt.Axes, title: str, ylabel: str) -> None:
    ax.set_title(title, loc="left", fontsize=11, color=INK)
    ax.set_ylabel(ylabel, color=MUTED)
    ax.tick_params(colors=MUTED)
    ax.grid(axis="y", color=GRID, linewidth=0.8)
    ax.set_axisbelow(True)
    for side in ("top", "right"):
        ax.spines[side].set_visible(False)
    for side in ("left", "bottom"):
        ax.spines[side].set_color(GRID)


def table(name: str, header: list[str], rows: list[list[object]]) -> None:
    with (OUT / f"{name}.csv").open("w", newline="", encoding="utf-8") as handle:
        writer = csv.writer(handle)
        writer.writerow(header)
        writer.writerows(rows)


def latency_and_throughput() -> None:
    data = json.loads((ROOT / "evidence/benchmarks/aws-concurrency-eu-north-1.json").read_text())
    closed = [s for s in data["summaries"] if s["phase"] == "closed"]
    clients = [s["clients"] for s in closed]
    med = [s["latencyMs2xx"]["median"] for s in closed]
    p95 = [s["latencyMs2xx"]["p95"] for s in closed]
    rps = [s["successfulRps"] for s in closed]
    table("fig-latency-concurrency", ["clients", "requests", "median_ms", "p95_ms", "p99_ms",
                                      "successful_rps", "http_429"],
          [[s["clients"], s["requests"], s["latencyMs2xx"]["median"], s["latencyMs2xx"]["p95"],
            s["latencyMs2xx"]["p99"], s["successfulRps"], s["statusCounts"].get("429", 0)]
           for s in data["summaries"]])

    fig, ax = plt.subplots(figsize=(6.4, 3.4), dpi=200)
    x = range(len(clients))
    width = 0.38
    ax.bar([i - width / 2 - 0.01 for i in x], med, width, color=BLUE, label="median")
    ax.bar([i + width / 2 + 0.01 for i in x], p95, width, color=ORANGE, label="p95")
    for i, (m, p) in enumerate(zip(med, p95, strict=True)):
        ax.annotate(f"{m:.0f}", (i - width / 2, m), ha="center", va="bottom", fontsize=7, color=INK)
        ax.annotate(f"{p:.0f}", (i + width / 2, p), ha="center", va="bottom", fontsize=7, color=INK)
    ax.set_xticks(list(x), [f"{c} client{'s' if c > 1 else ''}" for c in clients])
    style(ax, "End-to-end latency of successful requests (60 per level, eu-north-1)", "ms")
    ax.legend(frameon=False, fontsize=8, loc="upper left")
    fig.tight_layout()
    fig.savefig(OUT / "fig-latency-concurrency.png")
    plt.close(fig)

    fig, ax = plt.subplots(figsize=(6.4, 3.2), dpi=200)
    ax.plot(clients, rps, color=BLUE, linewidth=2, marker="o", markersize=6)
    for c, r in zip(clients, rps, strict=True):
        ax.annotate(f"{r:.1f}", (c, r), textcoords="offset points", xytext=(0, 7), ha="center",
                    fontsize=8, color=INK)
    ax.set_xticks(clients)
    ax.set_xlabel("concurrent clients", color=MUTED)
    style(ax, "Successful requests per second (mixed workload, no 429)", "requests / s")
    fig.tight_layout()
    fig.savefig(OUT / "fig-throughput-concurrency.png")
    plt.close(fig)


def throttling() -> None:
    data = json.loads((ROOT / "evidence/benchmarks/aws-throttle-single-method-eu-north-1.json").read_text())
    runs = data["summaries"]
    labels = [f"{s['clients']} clients, {'unpaced' if s['phase'] == 'closed' else str(s['targetRps']) + ' req/s'}"
              for s in runs]
    ok = [s["statusCounts"].get("200", 0) for s in runs]
    throttled = [s["statusCounts"].get("429", 0) for s in runs]
    table("fig-throttle-single-method", ["run", "http_200", "http_429", "offered_rps"],
          [[lab, o, t, s["offeredRps"]] for lab, o, t, s in zip(labels, ok, throttled, runs, strict=True)])
    fig, ax = plt.subplots(figsize=(6.4, 2.6), dpi=200)
    y = range(len(runs))
    ax.barh(list(y), ok, color=BLUE, label="200 OK", height=0.5)
    ax.barh(list(y), throttled, left=[o + 0.6 for o in ok], color=ORANGE, label="429 throttled", height=0.5)
    for i, (o, t) in enumerate(zip(ok, throttled, strict=True)):
        ax.annotate(f"{o} / {t}", (o + t + 2, i), va="center", fontsize=8, color=INK)
    ax.set_yticks(list(y), labels)
    ax.set_xlim(0, 115)
    style(ax, "GET /notes/{id} only: 200 vs 429 (limit 10 req/s, burst 20)", "")
    ax.grid(axis="x", color=GRID, linewidth=0.8)
    ax.grid(axis="y", visible=False)
    ax.legend(frameon=False, fontsize=8, loc="upper center", bbox_to_anchor=(0.5, -0.12), ncol=2)
    fig.tight_layout()
    fig.savefig(OUT / "fig-throttle-single-method.png")
    plt.close(fig)


def costs() -> None:
    # List-price scenarios from AWS_COST_ANALYSIS.md (Price List API, eu-north-1, 2026-11-16) and
    # the measured gross usage of the unrelated always-on EC2 t3.small (Cost Explorer, Nov 1-17).
    ce = json.loads((ROOT / "evidence/aws/bachelor-evaluation.json").read_text())["costExplorer"]
    ec2_nov = sum(r["usd"] for r in ce["usageByService"] if r["month"] == "2026-11" and r["key"] in (
        "Amazon Elastic Compute Cloud - Compute", "EC2 - Other", "Amazon Virtual Private Cloud"))
    ec2_month = round(ec2_nov / 17 * 30, 2)
    rows = [("Serverless: demo\n10k req, 5 users", 1.0), ("Serverless: small\n300k req, 200 users", 2.35),
            ("Serverless: moderate\n5M req, 5k users", 25.0), ("Always-on EC2 t3.small\n(measured, unrelated)", ec2_month)]
    table("fig-cost-scenarios", ["scenario", "usd_per_month", "source"],
          [[r[0].replace("\n", " "), r[1], "Cost Explorer gross usage Nov 1-17 x 30/17"
            if "EC2" in r[0] else "list-price estimate"] for r in rows])
    fig, ax = plt.subplots(figsize=(6.4, 3.2), dpi=200)
    colors = [BLUE, BLUE, BLUE, ORANGE]
    ax.bar(range(len(rows)), [r[1] for r in rows], color=colors, width=0.6)
    for i, (_l, v) in enumerate(rows):
        ax.annotate(f"${v:.2f}", (i, v), textcoords="offset points", xytext=(0, 3), ha="center",
                    fontsize=8, color=INK)
    ax.set_xticks(range(len(rows)), [r[0] for r in rows], fontsize=7)
    style(ax, "Monthly cost: serverless estimates vs. an always-on small VM (USD)", "USD / month")
    fig.tight_layout()
    fig.savefig(OUT / "fig-cost-scenarios.png")
    plt.close(fig)


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    plt.rcParams.update({"font.family": "DejaVu Sans", "font.size": 8})
    latency_and_throughput()
    throttling()
    costs()
    print(f"Figures written to {OUT}")


if __name__ == "__main__":
    main()

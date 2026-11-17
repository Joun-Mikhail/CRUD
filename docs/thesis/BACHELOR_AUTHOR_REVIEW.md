# Author review list — bachelor's thesis draft

[`BACHELOR_THESIS_DRAFT.md`](BACHELOR_THESIS_DRAFT.md) was prepared with AI assistance on 2026-11-17. It is a technical content draft, not a submission. Items that also apply to the semestral report are in [`AUTHOR_REVIEW.md`](AUTHOR_REVIEW.md) (template, declaration, AI disclosure, figure replacement, reference checks). Find every open marker with `grep -n "AUTHOR-VERIFY" docs/thesis/BACHELOR_THESIS_DRAFT.md`.

## Must do before submission

1. **Obtain the official bachelor's thesis assignment** and check the draft against its exact wording (the draft assumes tasks 4 and 5 of the semestral assignment page). Update dates and the academic year on the title page.
2. **Rewrite in your own words and expand** chapters 3–5 (theory, comparison, justification) — they are condensed from the semestral draft and are too short for a bachelor's thesis. Add your own reasoning and literature.
3. **Write the Czech abstract** (Abstrakt) and keywords.
4. **AI-use statement** (Appendix B): agree the wording with doc. Malina under the current VUT rules; sign the declaration yourself.
5. **Re-check the bill** a few days after 2026-11-17: `aws ce get-cost-and-usage --time-period Start=2026-11-01,End=<today> --granularity MONTHLY --metrics UnblendedCost --group-by Type=DIMENSION,Key=SERVICE` (USD 0.01 per call) and replace the sentence "the thesis services had not yet appeared" in Chapter 16 with the real amounts.
6. **Figures:** export Figures 6.1 and 6.2 (Mermaid) as images; add real console screenshots (DynamoDB items and index, Lambda functions, API Gateway authorizer, CloudWatch Logs Insights, alarms), hiding the account ID and e-mail addresses. Figures 12.1, 12.2, 13.1 and 16.1 are generated from evidence (`scripts/docs/make_figures.py`); their data tables are the CSV files next to them.
7. **References:** confirm each source supports its sentence; [23] (API Gateway throttling: "best-effort basis", "per-method throttling limits that you set for an API stage") and [24] (Lambda scaling) were added for the bachelor draft.

## Results you must be able to explain

| Claim | Where the data is | What to understand |
|---|---|---|
| Median ≈ 120 ms at 1–8 clients | `evidence/benchmarks/aws-concurrency-eu-north-1.json` | why latency is network-dominated (Lambda ≈ 10 ms) |
| p99 is "worst observed" | same | why 60–100 samples cannot give a stable p99 |
| 11 cold starts during scale-out, peak concurrency 8 | `evidence/aws/bachelor-evaluation.json` | one cold start per new execution environment |
| Throttle is per method | `aws-throttle-single-method-eu-north-1.json`, stage settings | why the mixed workload saw no 429 at 60 req/s; why 16.4 req/s were accepted with a 10 req/s limit (burst + best effort) |
| Every forged/tampered token rejected; 401 vs 403 | `evidence/tests/token-security-tests.json` | 401 = authorizer cannot use the token (unsigned, unknown key, expired, wrong issuer); 403 = well-formed token whose signature fails against the pool's key |
| Deleted user's token still accepted (R01) | same | stateless JWT validation; mitigation = short lifetime |
| Payable cost USD 0, gross usage from an unrelated EC2 | `evidence/aws/bachelor-evaluation.json` (`costExplorer`) | gross vs. credits vs. payable; why the thesis services did not yet show |
| Worst-case cost ≈ USD 600 / month | `AWS_COST_ANALYSIS.md` | per-method throttle × 5 methods × price |

## Not done (state honestly at the defence)

- No distributed or long load test; the highest measured rate was ≈ 60 req/s for about one second.
- Alarm notification path not tested (no `AlarmEmail`).
- No token from a second *real* Cognito pool (a self-signed foreign issuer was used), no penetration test.
- Development stage without backups or deletion protection.

# Author review list — bachelor's thesis

Source: [`BACHELOR_THESIS_DRAFT.md`](BACHELOR_THESIS_DRAFT.md); review copies: [`export/BACHELOR_THESIS_REVIEW.pdf`](export/BACHELOR_THESIS_REVIEW.pdf) and `.docx`. Prepared with AI assistance (2026-11-17) from the repository and its evidence; it is a reviewed draft, not a submission. Items shared with the semestral thesis (template, declaration, AI disclosure, reference checks) are in [`AUTHOR_REVIEW.md`](AUTHOR_REVIEW.md). Open markers: `grep -n "AUTHOR-VERIFY" docs/thesis/BACHELOR_THESIS_DRAFT.md` (highlighted yellow in the review copies).

## Must do before submission

1. **Official bachelor's thesis assignment.** The assignment page in the draft is copied from the *semestral* assignment, which lists tasks 4–5. Obtain the bachelor's assignment from the information system, compare the wording, and correct the academic year (assumed 2026/27) and the year on the title page and in the citation (assumed 2027).
2. **Rewrite in your own words.** Chapters 1–2 (theory, comparison) are condensed from the semestral thesis; extend them with your own reasoning and, where the supervisor expects it, further literature. Do not add sources you have not read.
3. **Czech abstract** (Abstrakt) and keywords: a draft exists; check language and terminology.
4. **Extended Czech abstract?** Check whether FEKT requires an extended abstract in Czech for theses written in English (not present in the template sample that was consulted; not drafted).
5. **AI-use statement** (Appendix C): agree the wording with doc. Malina under the current BUT rules; sign the declaration yourself only if it is true.
6. **Bill re-check** a few days after 2026-11-17: `aws ce get-cost-and-usage --time-period Start=2026-11-01,End=<today> --granularity MONTHLY --metrics UnblendedCost --group-by Type=DIMENSION,Key=SERVICE` (USD 0.01 per call), then replace the marked paragraph in Section 13.3 with the real amounts.
7. **Screenshots** (two placeholders): the public site with a notes list (Section 6.5) and CloudWatch Logs Insights or the alarm list (Section 8.2). Hide the account ID and e-mail addresses.
8. **References:** confirm for every source that it supports the sentence citing it ([22] API Gateway throttling: "best-effort basis"; [23] Lambda scaling were added for the bachelor's stage).
9. **Official template:** move the text into the official FEKT template; the review copy only imitates its structure.

## Results you must be able to explain

| Claim | Where the data is | What to understand |
|---|---|---|
| Median ≈ 120 ms at 1–8 clients (Table 11.1) | `evidence/benchmarks/aws-concurrency-eu-north-1.json` | why latency is network-dominated (Lambda ≈ 10 ms) |
| p99 reported as "worst observed" | same | why 60–100 samples cannot give a stable p99 |
| 11 cold starts, peak concurrency 8 (Table 11.2) | `evidence/aws/bachelor-evaluation.json` | one cold start per new execution environment |
| Throttle is per method (Table 11.3) | `aws-throttle-single-method-eu-north-1.json` | why the mixed workload saw no 429 at 60 req/s; why 16.4 req/s were accepted with a 10 req/s limit (burst + best effort) |
| 401 vs 403 for forged tokens (Table 12.1) | `evidence/tests/token-security-tests.json` | 401 = the authorizer cannot use the token; 403 = well-formed token whose signature fails |
| Deleted user's token accepted until expiry (R01) | same | stateless JWT validation; mitigation = short token lifetime |
| Payable USD 0; gross usage from an unrelated EC2 (Table 13.3) | `evidence/aws/bachelor-evaluation.json` (`costExplorer`) | gross vs. credits vs. payable; why the thesis services did not yet show |
| Worst-case ≈ USD 600 per month (Section 13.5) | `AWS_COST_ANALYSIS.md` | per-method throttle × five methods × price |

## Figures

Diagrams 4.1–4.3, 5.1, 5.2 and 7.1 are drawn from the implementation (sources `figures/src/*.mmd`, rendered by `scripts/docs/render_diagrams.mjs`); charts 11.1–11.3 and 13.1 are generated from the evidence files (`scripts/docs/make_figures.py`, data in the CSV files; checked against the JSON on 2026-11-17). Figures 6.1, 9.1 and 11.4 are real screenshots of the deployed system with test users (SES simulator addresses).

## Not done (state honestly at the defence)

- No distributed or long load test; the highest measured rate was ≈ 60 req/s for about one second.
- Alarm notification path not tested (no `AlarmEmail`).
- No token from a second *real* Cognito pool (a self-signed foreign issuer was used), no penetration test.
- Development stage without backups or deletion protection.

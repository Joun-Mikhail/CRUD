# Author review list — before submitting the semestral report

The report draft [`SEMESTRAL_REPORT.md`](SEMESTRAL_REPORT.md) was prepared with AI assistance on 2026-11-17. It is **not** a final submission. You (the author) are responsible for every sentence. Work through this list; every place marked `[AUTHOR-VERIFY]` in the draft is also listed here (`grep -n "AUTHOR-VERIFY" docs/thesis/SEMESTRAL_REPORT.md`).

## 1. Must do (blocking submission)

1. **Read the whole draft and rewrite it in your own words where it does not sound like you.** You must be able to explain every paragraph at the defence. Pay particular attention to chapters 2–3 (research), which the assignment expects to be your own study.
2. **Use the official VUT/FEEC template** (Word or LaTeX) and move the text into it. Keep the original title page, the official assignment page unchanged, and sign the author's declaration yourself. Do not sign a declaration of independent work that is inaccurate — combine it with the AI-use statement (Appendix A) as the faculty rules require.
3. **AI-use disclosure.** Check the current VUT rules on the use of generative AI in student work and agree the wording of Appendix A with your supervisor (doc. Ing. Lukáš Malina, Ph.D.).
4. **Fix the bibliographic citation:** the original report called this a "Bachelor's Thesis"; it is a semestral thesis. Use the exact format and URL from the faculty system.
5. **Replace the figures from the original report.** Its screenshots show unrelated resources (a "Task API", tables `CRUD`/`Tasks`, a Node.js function, someone else's e-mail address) and one placeholder. Use only screenshots of *this* system (see section 3).
6. **Verify every reference** in the list: open each source, check that it supports the sentence where it is cited, and confirm the bibliographic data. All URLs answered HTTP 200 on 2026-11-17 (automated check); the content match was not checked. Specific items:
   - [4] *RESTful Web APIs*: ISBN — the original report gave 978-1-4493-5857-0, the draft uses 978-1-4493-5806-8; check the edition you used.
   - Table 2.1 (service names of Azure and Google Cloud): names change often (e.g. Google *Cloud Functions* → *Cloud Run functions*, Azure AD B2C → *Microsoft Entra External ID*); confirm in [17], [18].
   - The removed vendor blog reference (Strapi "RESTful API Design Guide") was replaced by RFC 9110 and Fielding's dissertation; keep it out unless your supervisor accepts blog sources.
7. **Czech abstract (Abstrakt):** check grammar and terminology.
8. **Region statement (section 2.4):** confirm with your supervisor that eu-north-1 instead of eu-central-1 is acceptable (cause: organization policy of the AWS account, ADR 0008).

## 2. Technical claims to understand and re-check yourself

| Section | Claim | How to check |
|---|---|---|
| 2.2 | Lambda: 15 min maximum duration, 6 MB synchronous payload; DynamoDB item 400 KB | Lambda and DynamoDB quotas pages |
| 3.2 | Cognito signs with RS256; access tokens carry `client_id`, `token_use`, `scope`, no `aud` | Decode your own access token (e.g. jwt.io offline) — never paste a live token into a website |
| 3.4 | User pools vs. identity pools | Cognito Developer Guide |
| 4.3 | Why `noteId` PK + GSI instead of a composite key (403 vs 404) | `docs/decisions/README.md` ADR 0002 |
| 4.6 / 5.5 | Ownership check inside the conditional write; `ReturnValuesOnConditionCheckFailure` | `backend/src/notes_api/repositories/notes_repository.py` |
| 6.3 | Missing scope → 401, bad signature → 403 (measured behaviour of API Gateway) | `evidence/tests/live-api-tests.json` A02, A07 |
| 6.4 | Latency numbers and cold-start improvement | `evidence/benchmarks/aws-dev-eu-north-1.json`, `evidence/aws/cloudwatch.txt` |
| 6.5 | Scalability statements are **expectations**, not measurements | keep them labelled as such |
| 6.6 | Cost scenarios are **estimates** at list price; credits USD 158.72 read on 2026-11-17 | `AWS_COST_ANALYSIS.md`; Billing console |
| 6.2 | Your manual real-mailbox check (registration, code, sign-in, reset, CRUD) has no evidence file | Optionally take screenshots now and add them to `evidence/screenshots/` |

## 3. Figures to produce (real screenshots only)

| Figure | What to show | Source |
|---|---|---|
| Architecture | export the Mermaid diagram of Figure 4.1 (GitHub renders it) or redraw it | report 4.2 |
| Public application | notes list on the CloudFront URL | `evidence/screenshots/aws-13-hosted-cloudfront-notes.png` (exists) |
| Isolation | 403 when opening another user's note | `evidence/screenshots/aws-11-isolation-forbidden.png` (exists) |
| DynamoDB | table `serverless-notes-dev-notes` → Explore items, and the `byUser` index | take in the AWS console (hide account id and e-mail) |
| Lambda | the five functions (Python 3.13, arm64) | AWS console |
| API Gateway | resources and the Cognito authorizer with scopes | AWS console |
| CloudWatch | Logs Insights query tracing one `requestId`; alarm list | AWS console; procedure in `docs/deployment/TROUBLESHOOTING.md` |
| Cognito | user pool overview (hide e-mail addresses) | AWS console |

Remove the account ID, e-mail addresses and tokens from every screenshot.

## 4. Sections of the original report to drop or replace

- Duplicated paragraphs ("AWS Region and Deployment", "DynamoDB Table Design", "API Gateway Configuration", "Limitations", "Conclusion").
- Frankfurt / eu-central-1, Python 3.11, "no secondary index", "application-level filtering", identity-pool figure, HS256/`aud` JWT figure, "404 independent of authentication state".
- In-text citation numbers that did not match the literature list.
- Abstract that omitted "delete".

The original PDF is kept unchanged as a historical reference (outside the repository, in your Downloads folder).

## 5. Before the defence

- Practise the demonstration ([`DEMO_SCRIPT.md`](DEMO_SCRIPT.md)) and the questions in [`SUPERVISOR_QUESTIONS.md`](../../SUPERVISOR_QUESTIONS.md).
- Be ready to say clearly which parts were AI-assisted and how you verified them.

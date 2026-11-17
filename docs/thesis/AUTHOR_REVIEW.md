# Author review list — semestral thesis

Source: [`SEMESTRAL_REPORT.md`](SEMESTRAL_REPORT.md); review copies: [`export/SEMESTRAL_THESIS_REVIEW.pdf`](export/SEMESTRAL_THESIS_REVIEW.pdf) and `.docx`. The text was prepared with AI assistance (2026-11-17) and is **not** a submission. You are responsible for every sentence. Every `[AUTHOR-VERIFY]` marker (highlighted yellow in the review copies) is a decision or check that only you can make: `grep -n "AUTHOR-VERIFY" docs/thesis/SEMESTRAL_REPORT.md`.

## 1. Must do before the supervisor sees it as "your" text

1. **Read the whole text and rewrite it in your own words where it does not sound like you.** You must be able to explain every paragraph at the defence; chapters 2–3 (research) are expected to be your own study.
2. **Decide the status of this version with the supervisor** (note in Chapter 1): the assignment is for 2025/26, but the deployment, live tests and measurements are dated 16–17 November 2026. Say clearly whether this revised version replaces or supplements the semestral report you submitted originally.
3. **AI-use disclosure** (Appendix A): check the current BUT rules on generative AI and agree the wording with doc. Ing. Lukáš Malina, Ph.D. The declaration page states that you did not violate those rules — sign it only if that is true.
4. **Assignment page:** the copy in the review document was transcribed from a rendered image of the original PDF; compare it with the original (literature list and dates were not legible in the crop) and replace it with the page from the information system.

## 2. Must do before final submission

1. **Official template.** The review copy imitates the FEKT structure (A4, 35/25 mm margins, front-matter order, citation and declaration wording from the template sample at https://www.latex.fekt.vut.cz/sablona_zaverecne_prace) but is not the official template. Move the text into the official template (LaTeX `thesis` package or the faculty's Word template) and use the title page and assignment from the information system.
2. **Bibliographic citation:** the faculty system generates it; the original report wrongly said "Bachelor's Thesis".
3. **References** (now numbered in order of first citation): open each source and confirm it supports the sentence where it is cited. URLs answered HTTP 200 on 2026-11-17; that does not prove support. Specific items: the ISBN of *RESTful Web APIs* (978-1-4493-5806-8 vs. 978-1-4493-5857-0 in the original report); the Azure and Google service names in Table 2.1.
4. **Czech abstract (Abstrakt):** check grammar and terminology.
5. **Region (Section 2.4):** confirm that eu-north-1 instead of eu-central-1 is acceptable (organization policy of the AWS account, ADR 0008).
6. **Sign the declaration by hand** in the printed version. It is deliberately not signed.

## 3. Figures

| Figure | Status |
|---|---|
| 3.1 Sign-in with PKCE, 4.1 Architecture, 4.2 Data model, 4.3 Ownership decisions | diagrams drawn from the implementation; sources `figures/src/*.mmd`; check that you can explain each arrow |
| 6.1 Notes list on the deployed stack | real screenshot `evidence/screenshots/aws-12-notes-list.png` (test user with an SES simulator address) |
| 6.2 403 for another user's note | real screenshot `evidence/screenshots/aws-11-isolation-forbidden.png` |
| Placeholder in 6.2 | optional console screenshot (API Gateway routes and authorizer, or DynamoDB table and index) — take it yourself, hide the account ID and e-mail addresses |

Note: `evidence/screenshots/aws-13-hosted-cloudfront-notes.png` shows the public site in a **throttled (429)** state, not a notes list. It is used as such in the bachelor's thesis; do not caption it as a notes list.

Do not reuse the figures of the original report: they showed unrelated resources (a "Task API", tables `CRUD`/`Tasks`, a Node.js function, someone else's e-mail address) and one placeholder.

## 4. Technical claims to understand and re-check yourself

| Section | Claim | How to check |
|---|---|---|
| 2.2 | Lambda: 15 min maximum duration, 6 MB synchronous payload; DynamoDB item 400 KB | Lambda and DynamoDB quota pages |
| 3.2 | Cognito signs with RS256; access tokens carry `client_id`, `token_use`, `scope`, no `aud` | decode your own access token offline — never paste a live token into a website |
| 4.3 | Why `noteId` PK + GSI instead of a composite key (403 vs 404) | `docs/decisions/README.md` ADR 0002 |
| 4.6 / 5.5 | Ownership check inside the conditional write | `backend/src/notes_api/repositories/notes_repository.py` |
| 5.7, 7 | Throttling 10 req/s, burst 20, applied **per method** | `evidence/benchmarks/aws-throttle-single-method-eu-north-1.json` |
| 6.3 | Missing scope → 401, bad signature → 403 (measured) | `evidence/tests/live-api-tests.json` A02, A07 |
| 6.4 | Latency numbers and cold-start improvement | `evidence/benchmarks/aws-dev-eu-north-1.json`, `evidence/aws/cloudwatch.txt` |
| 6.5 | Scalability statements are **expectations**, not measurements | keep them labelled as such |
| 6.6 | Cost scenarios are **estimates** at list price | `AWS_COST_ANALYSIS.md` |
| 6.2 | Your manual real-mailbox check has no evidence file | optionally add screenshots to `evidence/screenshots/` |

## 5. Before the defence

- Practise the demonstration ([`DEMO_SCRIPT.md`](DEMO_SCRIPT.md)) and the questions in [`SUPERVISOR_QUESTIONS.md`](../../SUPERVISOR_QUESTIONS.md).
- Be ready to say clearly which parts were AI-assisted and how you verified them.

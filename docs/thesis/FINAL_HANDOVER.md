# Final handover — thesis manuscripts (2026-11-17)

Both manuscripts are **review drafts prepared with AI assistance**. They are ready to be read by the author and shown to the supervisor for substantive review; neither is approved for submission. Nothing in this package was signed, approved or confirmed by the supervisor or the faculty.

## A. Files created or changed (this branch)

| Path | What it is |
|---|---|
| `docs/thesis/export/SEMESTRAL_THESIS_REVIEW.pdf`, `.docx` | Semestral thesis review copy, 43 pages |
| `docs/thesis/export/BACHELOR_THESIS_REVIEW.pdf`, `.docx` | Bachelor's thesis review copy, 57 pages |
| `docs/thesis/SEMESTRAL_REPORT.md` | Editable source of the semestral thesis (revised) |
| `docs/thesis/BACHELOR_THESIS_DRAFT.md` | Editable source of the bachelor's thesis (restructured and expanded) |
| `docs/thesis/figures/fig-architecture`, `fig-auth-flow`, `fig-request-flow`, `fig-data-model`, `fig-ownership-flow`, `fig-deployment-monitoring` (`.png` + `.svg`) | Six new diagrams |
| `docs/thesis/figures/src/*.mmd` | Editable Mermaid sources of the diagrams |
| `scripts/docs/render_diagrams.mjs` | Renders the diagrams (Playwright Chromium + Mermaid 11.4.1) |
| `scripts/docs/build_thesis.py`, `scripts/docs/word_finalize.ps1` | Builds DOCX (pandoc) and PDF (Microsoft Word) |
| `scripts/docs/check_references.py` | Checks citations, bibliography, figure and table numbering; renumbers citations |
| `docs/thesis/AUTHOR_REVIEW.md`, `BACHELOR_AUTHOR_REVIEW.md` | Author checklists (updated) |
| `docs/thesis/FINAL_HANDOVER.md`, `TONIGHT_ACTIONS.md`, `README.md` | This handover, tonight's checklist, index |

Unchanged: the original semestral PDF (in Downloads, outside the repository), all evidence under `evidence/`, the four evidence charts, the application and the AWS resources. `export/SEMESTRAL_REPORT.docx` (PR #8) is superseded but kept.

## B. Semestral thesis — official tasks 1–3

| Task (official wording, abbreviated) | Where | Status |
|---|---|---|
| 1. Research cloud platforms, serverless technologies, managed databases, authentication and authorization methods | Chapters 2–3 | covered; needs the author's own wording |
| 2. Design: entities, data model, endpoints, request/response formats, user roles, access rules | Chapter 4, Figures 4.1–4.3, Tables 4.1–4.5 | covered |
| 3. Implement and test a prototype with CRUD, validation and error handling; describe it in the report | Chapters 5–6, 193 automated tests, 38 live checks | covered, verified on AWS |

The semestral text was corrected (per-method throttling, stage note, figures, citation order) and kept to its scope; later results are only pointed to, not reported.

## C. Bachelor's thesis — tasks 4–5 and their evidence

| Requirement | Evidence | Status |
|---|---|---|
| Full backend: REST API, database, authentication | deployed stack `serverless-notes-dev`; `evidence/aws/deployed-resources.txt`; 38/38 live checks | supported |
| All required entities | Note + Cognito users | supported |
| User management | sign-up, verification, sign-in, sign-out, reset; reset only checked manually | supported (one manual check) |
| Logging and monitoring | structured logs, request tracing, 4 alarms in state OK | supported; notification path not verified |
| Functionality | 193 + 66 + 14 tests, 38 live checks | supported |
| Performance | sequential (500 requests) and concurrent (1–8 clients) benchmarks | supported, single client machine |
| Scalability | up to ≈ 60 req/s measured; Lambda scale-out to 8; beyond argued | partly measured |
| Security | 10/10 token tests incl. a real expired token (401), threat analysis, configuration review | supported; no penetration test |
| Costs | list-price model, Cost Explorer reconciliation, comparison with an always-on VM | supported; thesis-service share of the bill not yet visible |
| Extensions | web client implemented; mobile, integration, sharing, hardening discussed | supported |

## D. Verified automatically in this session

- Every citation has a bibliography entry and every entry is cited (semestral 22/22, bachelor 24/24); both lists are numbered in order of first citation.
- Figure and table numbers are consecutive per chapter and every figure and table is mentioned in the text (`check_references.py`; one false positive for "Figures 11.1 and 11.2").
- The chart data (CSV) match the benchmark JSON files value by value (medians, p95, p99, rates, 429 counts).
- Live-check groups and token-test results quoted in the bachelor's thesis match `live-api-tests.json` and `token-security-tests.json`.
- Both PDFs were rendered page by page and inspected visually (contact sheets of all pages, close-up of the architecture figure): no raw Mermaid, no missing images (6 and 13 embedded), Czech characters present, tables within the margins, contents and lists of figures and tables filled.
- No account ID, token, access key or e-mail address in the deliverables, sources or scripts (pattern scan of 27 files incl. PDF/DOCX text). Screenshots show only Amazon SES simulator test addresses.
- Layout facts taken from the official FEKT template sample (latex.fekt.vut.cz, thesis package 4.13): front-matter order, A4 with 35/25 mm margins, bibliographic-citation format, declaration wording.

## E. Not verified

- That each source actually supports the sentence citing it (URLs answered HTTP 200 earlier; content not checked).
- Compliance with the official template and the faculty's formatting rules — the review copies only imitate the structure.
- The bachelor's thesis assignment wording, academic year (assumed 2026/27) and submission year (assumed 2027).
- Whether FEKT requires an extended Czech abstract for theses written in English.
- The Czech abstracts (language and terminology).
- Alarm notifications, a token from a second real user pool, a penetration test, load above ≈ 60 req/s.
- The thesis services' real share of the AWS bill.

## F. Genuine blockers for submission

1. **Authorship and AI use.** The text is AI-drafted. It must be read, understood and rewritten by the author where needed, and the AI-use statement agreed with the supervisor under the BUT rules. The declaration states compliance with those rules; it must not be signed until that is true.
2. **Official template and IS pages.** Title page and assignment must come from the information system; the text must be typeset in the official template.
3. **Bachelor's assignment.** The draft quotes the semestral assignment's follow-up tasks; the official bachelor's assignment must be checked.
4. **Status of the revised semestral report.** Its AWS results are dated November 2026, after the 2025/26 semestral stage; the supervisor must agree how this version is used.
5. **Cost figure.** Section 13.3 must be updated with the measured amounts once Cost Explorer shows the thesis services.

## G. The five most important actions only you can perform

1. Read both manuscripts completely and rewrite every passage you cannot explain in your own words.
2. Agree with doc. Malina: the AI-use statement, the status of the revised semestral report, the region change, and the chapter structure.
3. Obtain the official bachelor's assignment and the IS-generated title pages; move the text into the official template.
4. Check each reference against its source and correct the Czech abstracts.
5. Capture the missing console screenshots and re-run the Cost Explorer query, then update the marked places.

## H. Recommendation

Show the supervisor the **semestral thesis review copy first** (`export/SEMESTRAL_THESIS_REVIEW.pdf`), together with the question how the revised version relates to the originally submitted report. It is shorter, closer to final, and its decisions (design, region, AI use) carry over into the bachelor's thesis. Send the bachelor's review copy afterwards, or together with it explicitly marked as an early draft for feedback on structure and evaluation.

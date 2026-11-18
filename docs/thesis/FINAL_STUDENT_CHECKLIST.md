# Final student checklist

Status on 2026-11-18: **technical development is closed.** Everything below is reading, deciding, writing and rehearsing that only you (or you with your supervisor) can do. Both manuscripts are AI-assisted review drafts in an **unofficial** layout modelled on the FEKT template; neither has been approved by anyone.

Two facts to keep straight in every conversation:

- **The thesis implementation** (backend, AWS deployment, live tests, benchmarks, Notes client) was verified on AWS on 16–17 November 2026. That is what the manuscripts describe.
- **LabProof Lite** (the Ohm's law lab, PR #11, plus small corrections on 2026-11-18) is a later frontend improvement, verified **locally only** (Local Demo: unit tests and Playwright). It is not in either manuscript and has not been run against AWS.

## 1. Required before sending the semestral report to the supervisor

- [ ] Read `docs/thesis/export/SEMESTRAL_THESIS_REVIEW.pdf` from start to end (43 pages). Mark every sentence you cannot explain, then rewrite those in your own words in `docs/thesis/SEMESTRAL_REPORT.md`.
- [ ] Compare the assignment page with your original semestral PDF (the copy used was partly illegible).
- [ ] Read the note "Note on this version and its dates" in Chapter 1 and decide how you present the revised version (see decision D1).
- [ ] Check the Czech abstract (Abstrakt).
- [ ] Open every `[AUTHOR-VERIFY]` marker: `grep -n "AUTHOR-VERIFY" docs/thesis/SEMESTRAL_REPORT.md` (11 markers, highlighted yellow in the PDF).
- [ ] Send the e-mail in Section 6 (adapt it first).

If you edit the source, rebuild and look at the PDF: `uv run --no-project --with pypandoc_binary --with python-docx python scripts/docs/build_thesis.py semestral` (needs Microsoft Word).

## 2. Required before the final bachelor's thesis submission

- [ ] Obtain the **official bachelor's assignment** and the title pages from the information system; correct the academic year and year (the draft assumes 2026/27 and 2027).
- [ ] Rewrite in your own words, especially Chapters 1–2 of `docs/thesis/BACHELOR_THESIS_DRAFT.md`; add only literature you have read.
- [ ] Move both texts into the **official** FEKT template (LaTeX or Word); check whether an extended Czech abstract is required.
- [ ] Check every reference against its source; fix the ISBN of *RESTful Web APIs* (two candidates are noted in the bibliography).
- [ ] Agree and insert the AI-use statement (Appendix A semestral / Appendix C bachelor). Sign the declaration by hand only when it is true.
- [ ] Re-run the Cost Explorer query and replace the marked paragraph in Section 13.3 (command in `BACHELOR_AUTHOR_REVIEW.md`, item 6; USD 0.01).
- [ ] Capture the three missing console screenshots (one in the semestral 6.2, two in the bachelor 6.5 and 8.2). Hide the account ID and e-mail addresses.
- [ ] Open every marker: `grep -n "AUTHOR-VERIFY" docs/thesis/BACHELOR_THESIS_DRAFT.md` (14 markers).

## 3. Required before the defence

- [ ] Explain without notes every table and figure of the bachelor's thesis: the list "Results you must be able to explain" in `docs/thesis/BACHELOR_AUTHOR_REVIEW.md`.
- [ ] Rehearse the live demo: `docs/thesis/DEMO_SCRIPT.md` (Notes, 10 min) and, if you show it, `docs/learning/LABPROOF_DEMO_SCRIPT.md` (8 min). Start the demo with `make demo-backend` and `make demo-frontend`.
- [ ] Practise the questions in `SUPERVISOR_QUESTIONS.md` and the ten questions at the end of `docs/learning/LABPROOF_FOR_BEGINNERS.md`.
- [ ] Prepare one honest paragraph: which parts were AI-assisted, and how you checked them (tests, evidence files, your own reading).
- [ ] Decide whether the AWS stacks keep running until the defence (decision D6). If they do, sign in once a week to confirm the public site still works.
- [ ] When re-running browser tests before the demo, use `npx playwright test --project=chromium`. Without `--project`, the screenshot project overwrites the evidence images in `evidence/screenshots/` (restore them with `git restore evidence/screenshots/`).

## 4. Optional improvements — skip them

These would cost time without changing the grade-relevant content. Mention them as future work instead.

- Alarm e-mail notification test, distributed or long load tests, penetration test.
- MFA, WAF, SES, point-in-time recovery, deletion protection, custom domain, staging stage.
- GitHub OIDC deploy role; redeploying the public site with LabProof.
- More LabProof experiments, measurement-uncertainty calculation, more than 10 readings, PDF libraries.
- Running LabProof against AWS — only if you want to show it there; then do one create → reopen → delete with `npm run dev:aws` and record it under `evidence/`.

## 5. Decisions only you or your supervisor can make

| # | Decision | Who | Where it matters |
|---|---|---|---|
| D1 | Does the revised semestral report (results dated Nov 2026) **replace or supplement** the report you originally submitted? | supervisor | semestral Chapter 1 note |
| D2 | Wording of the **AI-use statement** under current BUT/FEKT rules | you + supervisor | both appendices, declaration |
| D3 | Is **eu-north-1** (Stockholm) instead of Frankfurt acceptable? | supervisor | semestral 2.4, bachelor 2.4 |
| D4 | Is the **bachelor's chapter structure** (15 chapters, evaluation in 9–13) acceptable? | supervisor | bachelor draft |
| D5 | Should LabProof Lite appear in the bachelor's thesis at all, e.g. as a short "extension" section labelled *locally verified*? Default: leave it out. | you + supervisor | bachelor Ch. 15 |
| D6 | Keep the AWS stacks and the public site running until the defence, or destroy them after recording? | you | `scripts/cleanup/`, `make destroy` |
| D7 | Which sentences you rewrite, which sources you keep, and whether the text is yours to sign | you | everything |

## 6. Draft e-mail to the supervisor (not sent)

> **Subject:** Semestral thesis — revised review version and four questions
>
> Dear doc. Malina,
>
> I am sending a revised review version of my semestral thesis *Serverless CRUD API with Authentication* (attached: SEMESTRAL_THESIS_REVIEW.pdf). Compared with the report I submitted originally, it corrects technical errors, adds the design figures and reports the prototype deployed on AWS, with automated tests and measurements dated November 2026. The layout only imitates the FEKT template; I will move the final text into the official template.
>
> Before I continue with the bachelor's thesis, I would be grateful for your opinion on four points:
>
> 1. Should this revised version replace or supplement the semestral report I originally submitted?
> 2. Parts of the code and a first draft of the text were prepared with an AI assistant (Claude Code), which I have reviewed and am rewriting. How would you like me to word the AI-use statement under the current BUT rules?
> 3. The AWS account I use only permits the Stockholm region (eu-north-1), so the system does not run in Frankfurt as originally planned. Is that acceptable?
> 4. Would you like to see the early bachelor's thesis draft now for feedback on its structure, or later?
>
> Thank you for your time.
>
> Kind regards,
> John Heshmat (256986)

Before sending: re-read the attachment, adjust the wording to your own voice, and attach the bachelor's draft only if you decide to (point 4).

## 7. Files to open, in this order

1. `docs/thesis/export/SEMESTRAL_THESIS_REVIEW.pdf`, then its source `docs/thesis/SEMESTRAL_REPORT.md`
2. `docs/thesis/AUTHOR_REVIEW.md` (semestral details) and `docs/thesis/BACHELOR_AUTHOR_REVIEW.md`
3. `docs/thesis/export/BACHELOR_THESIS_REVIEW.pdf`, source `docs/thesis/BACHELOR_THESIS_DRAFT.md`
4. `docs/thesis/FINAL_HANDOVER.md` (what is verified and what is not)
5. `docs/thesis/DEMO_SCRIPT.md`, `SUPERVISOR_QUESTIONS.md`
6. LabProof only if you will show it: `docs/learning/LABPROOF_FOR_BEGINNERS.md`

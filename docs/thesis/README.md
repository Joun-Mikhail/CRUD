# Thesis documents

Start with [FINAL_STUDENT_CHECKLIST.md](FINAL_STUDENT_CHECKLIST.md) (what is left for you and your supervisor, decisions, draft e-mail). Background: [FINAL_HANDOVER.md](FINAL_HANDOVER.md) (status, what is verified, what blocks submission) and [TONIGHT_ACTIONS.md](TONIGHT_ACTIONS.md) (earlier ordered checklist).

| File | Purpose |
|---|---|
| [SEMESTRAL_REPORT.md](SEMESTRAL_REPORT.md) | Semestral thesis (tasks 1–3), editable source of the review copy |
| [export/SEMESTRAL_THESIS_REVIEW.pdf](export/SEMESTRAL_THESIS_REVIEW.pdf), [.docx](export/SEMESTRAL_THESIS_REVIEW.docx) | Semestral review copies (unofficial layout modelled on the FEKT template) |
| [BACHELOR_THESIS_DRAFT.md](BACHELOR_THESIS_DRAFT.md) | Bachelor's thesis manuscript (tasks 4–5 with the evaluation), editable source |
| [export/BACHELOR_THESIS_REVIEW.pdf](export/BACHELOR_THESIS_REVIEW.pdf), [.docx](export/BACHELOR_THESIS_REVIEW.docx) | Bachelor's review copies |
| [AUTHOR_REVIEW.md](AUTHOR_REVIEW.md) | Semestral thesis: what the author must verify, rewrite, sign or agree |
| [BACHELOR_AUTHOR_REVIEW.md](BACHELOR_AUTHOR_REVIEW.md) | Bachelor's thesis: companion review checklist |
| [figures/](figures/) | Charts generated from evidence (PNG + CSV data) and diagrams (PNG + SVG); diagram sources in [figures/src/](figures/src/) |
| [REQUIREMENTS_MATRIX.md](REQUIREMENTS_MATRIX.md) | Official assignment → delivered work → evidence → status |
| [SUPERVISOR_SUMMARY.md](SUPERVISOR_SUMMARY.md) | One-page project summary for the supervisor |
| [DEMO_SCRIPT.md](DEMO_SCRIPT.md) | 10-minute live demonstration |

`export/SEMESTRAL_REPORT.docx` is the older review copy from PR #8 and is superseded by `SEMESTRAL_THESIS_REVIEW.docx`. The original semestral report PDF is not stored in the repository and was not modified.

## Rebuilding

```bash
node scripts/docs/render_diagrams.mjs                                    # diagrams: figures/src/*.mmd -> PNG + SVG (Playwright Chromium, Mermaid 11.4.1 from jsDelivr)
uv run --no-project --with matplotlib python scripts/docs/make_figures.py # charts from evidence/ (PNG + CSV)
python scripts/docs/check_references.py docs/thesis/BACHELOR_THESIS_DRAFT.md   # citations, figure/table numbering
uv run --no-project --with pypandoc_binary --with python-docx python scripts/docs/build_thesis.py   # DOCX + PDF (needs Microsoft Word)
```

The build imitates the structure of the official FEKT template (front-matter order, A4, 35/25 mm margins, citation and declaration wording from the template sample at latex.fekt.vut.cz) but is **not** the official template. The final submission must be typeset in the official template.

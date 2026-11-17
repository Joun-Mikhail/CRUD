# Thesis documents

| File | Purpose |
|---|---|
| [SEMESTRAL_REPORT.md](SEMESTRAL_REPORT.md) | Semestral report **draft** (AI-assisted, for author review). Editable source |
| [export/SEMESTRAL_REPORT.docx](export/SEMESTRAL_REPORT.docx) | Review copy generated from the Markdown (see below); move the text into the official VUT template |
| [BACHELOR_THESIS_DRAFT.md](BACHELOR_THESIS_DRAFT.md) | Bachelor's thesis **content draft** (tasks 4–5, evaluation chapters with figures); AI-assisted, for author review |
| [BACHELOR_AUTHOR_REVIEW.md](BACHELOR_AUTHOR_REVIEW.md) | What the author must verify, rewrite and agree before submitting the bachelor's thesis |
| [figures/](figures/) | Thesis figures generated from evidence (PNG) with their data tables (CSV): `uv run --no-project --with matplotlib python scripts/docs/make_figures.py` |
| [AUTHOR_REVIEW.md](AUTHOR_REVIEW.md) | What the author must verify, rewrite, sign or agree with the supervisor before submission |
| [REQUIREMENTS_MATRIX.md](REQUIREMENTS_MATRIX.md) | Official assignment → delivered work → evidence → status (semestral / bachelor / optional) |
| [SUPERVISOR_SUMMARY.md](SUPERVISOR_SUMMARY.md) | One-page project summary for the supervisor |
| [DEMO_SCRIPT.md](DEMO_SCRIPT.md) | 10-minute live demonstration |

The original semestral report PDF is not stored in the repository and was not modified.

Regenerate the review copy (needs `uv`; downloads `pypandoc_binary`, which bundles pandoc):

```bash
uv run --no-project --with pypandoc_binary python scripts/docs/export_report.py
```

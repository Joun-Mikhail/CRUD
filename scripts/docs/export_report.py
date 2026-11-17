"""Export the semestral report draft to a DOCX review copy.

    uv run --no-project --with pypandoc_binary python scripts/docs/export_report.py

The Markdown file stays the editable source; the DOCX is a review copy to move into the
official VUT template. Mermaid diagrams are exported as code blocks (render them separately).
"""

from __future__ import annotations

from pathlib import Path

import pypandoc

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "docs" / "thesis" / "SEMESTRAL_REPORT.md"
TARGET = ROOT / "docs" / "thesis" / "export" / "SEMESTRAL_REPORT.docx"


def main() -> None:
    TARGET.parent.mkdir(parents=True, exist_ok=True)
    pypandoc.convert_file(
        str(SOURCE),
        "docx",
        format="gfm",
        outputfile=str(TARGET),
        extra_args=[
            "--toc",
            "--metadata",
            "title=Serverless CRUD API with Authentication",
        ],
    )
    print(f"Wrote {TARGET}")


if __name__ == "__main__":
    main()

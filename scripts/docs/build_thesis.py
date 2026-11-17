"""Build the review copies (DOCX + PDF) of the semestral and bachelor's thesis manuscripts.

    uv run --no-project --with pypandoc_binary --with python-docx python scripts/docs/build_thesis.py [semestral|bachelor]

Editable sources: docs/thesis/SEMESTRAL_REPORT.md and docs/thesis/BACHELOR_THESIS_DRAFT.md
(metadata in the leading "---" block, front-matter sections before "<!-- mainmatter -->").
Pipeline: Markdown -> pandoc (DOCX with a generated reference document) -> Microsoft Word
(scripts/docs/word_finalize.ps1: table layout, fields for contents and lists, PDF export).

The layout imitates the structure of the official FEKT BUT thesis template (A4, margins
35/25 mm, front matter order, citation and declaration wording) but is NOT the official
template; the final thesis must be moved into the official template from latex.fekt.vut.cz.
"""

from __future__ import annotations

import re
import subprocess
import sys
from pathlib import Path

import pypandoc
from docx import Document
from docx.enum.style import WD_STYLE_TYPE
from docx.enum.text import WD_ALIGN_PARAGRAPH, WD_COLOR_INDEX
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Mm, Pt, RGBColor

ROOT = Path(__file__).resolve().parents[2]
THESIS = ROOT / "docs" / "thesis"
EXPORT = THESIS / "export"
BUILD = EXPORT / "build"

DOCS = {
    "semestral": ("SEMESTRAL_REPORT.md", "SEMESTRAL_THESIS_REVIEW"),
    "bachelor": ("BACHELOR_THESIS_DRAFT.md", "BACHELOR_THESIS_REVIEW"),
}
# Printed width per image (default 16 cm = text width 15 cm + small margin is too wide; use 15 cm).
IMAGE_WIDTH = {
    "fig-architecture.png": "15cm",
    "fig-auth-flow.png": "14cm",
    "fig-request-flow.png": "15cm",
    "fig-data-model.png": "12.5cm",
    "fig-ownership-flow.png": "12.5cm",
    "fig-deployment-monitoring.png": "11.5cm",
    "aws-11-isolation-forbidden.png": "10.5cm",
    "aws-12-notes-list.png": "10.5cm",
    "aws-13-hosted-cloudfront-notes.png": "10.5cm",
}
BODY_FONT, HEAD_FONT, MONO_FONT = "Times New Roman", "Arial", "Consolas"

PAGEBREAK = '```{=openxml}\n<w:p><w:r><w:br w:type="page"/></w:r></w:p>\n```'


def field(instr: str, placeholder: str = "Right-click and choose Update Field.") -> str:
    return (
        "```{=openxml}\n<w:p><w:r><w:fldChar w:fldCharType=\"begin\" w:dirty=\"true\"/></w:r>"
        f"<w:r><w:instrText xml:space=\"preserve\"> {instr} </w:instrText></w:r>"
        "<w:r><w:fldChar w:fldCharType=\"separate\"/></w:r>"
        f"<w:r><w:t>{placeholder}</w:t></w:r><w:r><w:fldChar w:fldCharType=\"end\"/></w:r></w:p>\n```"
    )


def styled(style: str, text: str) -> str:
    return f'::: {{custom-style="{style}"}}\n{text}\n:::'


# --------------------------------------------------------------------------- reference document
def reference_docx(path: Path) -> None:
    default = BUILD / "pandoc-default.docx"
    data = pypandoc.convert_text("", "docx", format="markdown", outputfile=str(default))
    del data
    doc = Document(str(default))
    sec = doc.sections[0]
    sec.page_width, sec.page_height = Mm(210), Mm(297)
    sec.left_margin, sec.right_margin = Mm(35), Mm(25)
    sec.top_margin, sec.bottom_margin = Mm(25), Mm(25)
    sec.footer_distance = Mm(12)
    footer = sec.footer.paragraphs[0] if sec.footer.paragraphs else sec.footer.add_paragraph()
    footer.alignment = WD_ALIGN_PARAGRAPH.CENTER
    run = footer.add_run()
    for kind, text in (("begin", None), (None, "PAGE"), ("separate", None), (None, "1"), ("end", None)):
        if kind:
            el = OxmlElement("w:fldChar")
            el.set(qn("w:fldCharType"), kind)
        elif text == "PAGE":
            el = OxmlElement("w:instrText")
            el.set(qn("xml:space"), "preserve")
            el.text = " PAGE "
        else:
            el = OxmlElement("w:t")
            el.text = text
        run._r.append(el)

    st = doc.styles

    def para(name: str, *, font: str = BODY_FONT, size: float = 12, bold: bool = False,
             italic: bool = False, before: float = 0, after: float = 6, line: float = 1.15,
             align: WD_ALIGN_PARAGRAPH | None = None, color: str | None = None):
        s = st[name] if name in [x.name for x in st] else st.add_style(name, WD_STYLE_TYPE.PARAGRAPH)
        s.font.name, s.font.size, s.font.bold, s.font.italic = font, Pt(size), bold, italic
        rpr = s.element.get_or_add_rPr()
        fonts = rpr.find(qn("w:rFonts"))
        if fonts is None:
            fonts = OxmlElement("w:rFonts")
            rpr.append(fonts)
        for attr in ("w:ascii", "w:hAnsi", "w:cs", "w:eastAsia"):
            fonts.set(qn(attr), font)
        for attr in ("w:asciiTheme", "w:hAnsiTheme", "w:cstheme", "w:eastAsiaTheme"):
            if fonts.get(qn(attr)) is not None:
                del fonts.attrib[qn(attr)]
        s.font.color.rgb = RGBColor.from_string(color or "000000")
        pf = s.paragraph_format
        pf.space_before, pf.space_after, pf.line_spacing = Pt(before), Pt(after), line
        if align is not None:
            pf.alignment = align
        return s

    para("Normal")
    for name in ("Body Text", "First Paragraph"):
        para(name, align=WD_ALIGN_PARAGRAPH.JUSTIFY)
    para("Compact", size=12, after=2, line=1.15, align=WD_ALIGN_PARAGRAPH.LEFT)
    for level, size, before in ((1, 18, 0), (2, 14, 14), (3, 12, 10)):
        h = para(f"Heading {level}", font=HEAD_FONT, size=size, bold=True, before=before,
                 after=10 if level == 1 else 6, line=1.0)
        h.paragraph_format.keep_with_next = True
        h.paragraph_format.page_break_before = level == 1
    para("Image Caption", size=10.5, italic=False, before=4, after=12, align=WD_ALIGN_PARAGRAPH.CENTER)
    para("Table Caption", size=10.5, before=10, after=4, align=WD_ALIGN_PARAGRAPH.LEFT)
    st["Table Caption"].paragraph_format.keep_with_next = True
    para("Captioned Figure", after=2, align=WD_ALIGN_PARAGRAPH.CENTER)
    para("Figure", after=2, align=WD_ALIGN_PARAGRAPH.CENTER)
    para("Source Code", font=MONO_FONT, size=9, after=6, line=1.0)
    para("Block Text", size=10.5, before=4, after=8)
    st["Block Text"].paragraph_format.left_indent = Mm(6)
    para("Bibliography", size=11, after=4, line=1.0)
    para("FrontHeading", font=HEAD_FONT, size=16, bold=True, after=12, line=1.0)
    para("TP Large", font=HEAD_FONT, size=20, bold=True, after=6, line=1.0)
    para("TP Medium", font=HEAD_FONT, size=14, bold=True, after=2, line=1.0)
    para("TP Small", font=HEAD_FONT, size=9, after=14, line=1.0, color="555555")
    para("TP Normal", font=HEAD_FONT, size=12, after=4, line=1.1)
    para("Declaration Field", after=2, line=1.0, align=WD_ALIGN_PARAGRAPH.LEFT)
    para("Review Note", font=HEAD_FONT, size=9, after=4, line=1.0, color="8A1C1C")
    for level in (1, 2, 3):
        name = f"toc {level}"
        s = para(name, size=11.5, bold=level == 1, before=6 if level == 1 else 0, after=2, line=1.0)
        s.paragraph_format.left_indent = Mm(6 * (level - 1))
    para("table of figures", size=11, after=2, line=1.0)
    char = st.add_style("AuthorVerify", WD_STYLE_TYPE.CHARACTER)
    char.font.highlight_color = WD_COLOR_INDEX.YELLOW
    char.font.bold = True
    for name in ("Verbatim Char",):
        if name in [x.name for x in st]:
            st[name].font.name, st[name].font.size = MONO_FONT, Pt(10)
    if "Hyperlink" in [x.name for x in st]:
        st["Hyperlink"].font.color.rgb = RGBColor.from_string("1F4E8C")
    doc.save(str(path))


# --------------------------------------------------------------------------- markdown processing
def split_source(text: str) -> tuple[dict[str, str], str, str]:
    m = re.match(r"---\n(.*?)\n---\n", text, re.DOTALL)
    if not m:
        raise SystemExit("missing metadata block")
    meta: dict[str, str] = {}
    for line in m.group(1).splitlines():
        if ":" in line and not line.startswith(" "):
            key, value = line.split(":", 1)
            meta[key.strip()] = value.strip().strip('"')
    body = re.sub(r"<!--(?!\s*mainmatter).*?-->\n?", "", text[m.end():], flags=re.DOTALL)
    front, _, main = body.partition("<!-- mainmatter -->")
    return meta, front, main


def convert_markdown(md: str) -> str:
    # table captions: "*Table 4.1 — text* (extra)" -> pandoc caption paragraph before the table
    md = re.sub(r"^\*Table ([0-9A-Z.]+) — ([^*\n]+)\*([^\n]*)$", r": Table \1: \2\3", md, flags=re.MULTILINE)
    # image widths
    def img(m: re.Match[str]) -> str:
        name = Path(m.group(2)).name
        return f"![{m.group(1)}]({m.group(2)}){{width={IMAGE_WIDTH.get(name, '15cm')}}}"
    md = re.sub(r"!\[([^\]]*)\]\(([^)\s]+)\)(?!\{)", img, md)
    # highlight author-verification markers
    md = re.sub(r"\[AUTHOR-VERIFY([^\]]*)\]",
                lambda m: "[\\[AUTHOR-VERIFY" + m.group(1).replace("[", "(").replace("]", ")")
                + "\\]]{custom-style=\"AuthorVerify\"}", md)
    # bibliography entries: left-aligned "Bibliography" paragraphs (justified URLs leave gaps)
    def bib(m: re.Match[str]) -> str:
        entries = re.sub(r"^(\[\d+\] .*)$", lambda e: styled("Bibliography", e.group(1)), m.group(2), flags=re.MULTILINE)
        return m.group(1) + entries
    md = re.sub(r"(^## Bibliography\n)(.*?)(?=^## |\Z)", bib, md, flags=re.MULTILINE | re.DOTALL)
    return md


def front_matter(meta: dict[str, str], front: str) -> str:
    out: list[str] = []
    note = ("Unofficial review layout modelled on the FEKT BUT thesis template; replace this page "
            "with the title page generated by the BUT information system.")
    out.append(styled("Review Note", note))
    out.append(styled("TP Medium", "BRNO UNIVERSITY OF TECHNOLOGY"))
    out.append(styled("TP Small", "VYSOKÉ UČENÍ TECHNICKÉ V BRNĚ"))
    out.append(styled("TP Medium", "FACULTY OF ELECTRICAL ENGINEERING AND COMMUNICATION"))
    out.append(styled("TP Small", "FAKULTA ELEKTROTECHNIKY A KOMUNIKAČNÍCH TECHNOLOGIÍ"))
    out.append(styled("TP Medium", "DEPARTMENT OF TELECOMMUNICATIONS"))
    out.append(styled("TP Small", "ÚSTAV TELEKOMUNIKACÍ"))
    out.append(styled("TP Normal", "&nbsp;"))
    out.append(styled("TP Large", meta["title"].upper()))
    out.append(styled("TP Small", meta.get("title_cs", meta["title"]).upper()))
    out.append(styled("TP Normal", "&nbsp;"))
    out.append(styled("TP Medium", meta["paper_type"].upper()))
    out.append(styled("TP Small", meta["paper_type_cs"].upper()))
    out.append(styled("TP Normal", f"**AUTHOR** (AUTOR PRÁCE): {meta['author']}"))
    out.append(styled("TP Normal", f"**SUPERVISOR** (VEDOUCÍ PRÁCE): {meta['supervisor']}"))
    out.append(styled("TP Normal", "&nbsp;"))
    out.append(styled("TP Medium", f"BRNO {meta['year']}"))
    status = meta.get("status")
    if status:
        out.append(styled("Review Note", status))
    out.append(PAGEBREAK)

    # front sections (assignment, abstracts, citation) from the source: each "## X" on its own page
    sections = re.split(r"^## ", front.strip(), flags=re.MULTILINE)
    for sec in sections:
        if not sec.strip():
            continue
        head, _, rest = sec.partition("\n")
        out.append(styled("FrontHeading", head.strip()))
        out.append(convert_markdown(rest.strip()))
        out.append(PAGEBREAK)

    # declaration (wording of the official FEKT template, version 4.13)
    out.append(styled("FrontHeading", "Author’s Declaration"))
    out.append(styled(
        "Declaration Field",
        f"**Author:** {meta['author']}\n\n**Author’s ID:** {meta['author_id']}\n\n"
        f"**Paper type:** {meta['paper_type']}\n\n**Academic year:** {meta['academic_year']}\n\n"
        f"**Topic:** {meta['title']}"))
    out.append(
        "I declare that I have written my thesis independently, under the guidance of the advisor "
        "and using exclusively the technical references and other sources of information cited in "
        "the thesis and listed in the comprehensive bibliography at the end of the thesis. I have "
        "not violated the principles and recommendations of the Brno University of Technology "
        "regarding the use of generative artificial intelligence.\n\n"
        "As the author, I furthermore declare that, with respect to the creation of this thesis, I "
        "have not infringed any copyright or violated anyone’s personal and/or ownership rights. In "
        "this context, I am fully aware of the consequences of breaking Regulation S 11 of the "
        "Copyright Act No. 121/2000 Coll. of the Czech Republic, as amended, and of any breach of "
        "rights related to intellectual property or introduced within amendments to relevant Acts "
        "such as the Intellectual Property Act or the Criminal Code, Act No. 40/2009 Coll. of the "
        "Czech Republic, Section 2, Head VI, Part 4.\n\n"
        "Brno  . . . . . . . . . . . . . . .        . . . . . . . . . . . . . . . . . . . . . . . . . .\n\n"
        "author’s signature (signed by the author only, in the printed version)")
    out.append(convert_markdown(
        "[AUTHOR-VERIFY: wording copied from the official FEKT template sample (thesis package 4.13). "
        "Sign only if every statement is true; the AI assistance described in the appendix must comply "
        "with the BUT rules on generative AI and be agreed with the supervisor. Not signed here.]"))
    out.append(PAGEBREAK)
    out.append(styled("FrontHeading", "Acknowledgement"))
    out.append(convert_markdown("[AUTHOR-VERIFY: optional; write your own acknowledgement or remove this page.]"))
    out.append(PAGEBREAK)

    out.append(styled("FrontHeading", "Contents"))
    out.append(field(r'TOC \o "1-3" \h \z \u'))
    out.append(PAGEBREAK)
    out.append(styled("FrontHeading", "List of Figures"))
    out.append(field(r'TOC \h \z \t "Image Caption,1"'))
    out.append(PAGEBREAK)
    out.append(styled("FrontHeading", "List of Tables"))
    out.append(field(r'TOC \h \z \t "Table Caption,1"'))
    return "\n\n".join(out) + "\n\n"


def build(key: str) -> None:
    source, target = DOCS[key]
    meta, front, main = split_source((THESIS / source).read_text(encoding="utf-8"))
    md = front_matter(meta, front) + convert_markdown(main)
    BUILD.mkdir(parents=True, exist_ok=True)
    (BUILD / f"{target}.pandoc.md").write_text(md, encoding="utf-8")
    ref = BUILD / "reference.docx"
    reference_docx(ref)
    docx = EXPORT / f"{target}.docx"
    pypandoc.convert_text(
        md, "docx",
        format="markdown+pipe_tables+raw_attribute+fenced_divs+bracketed_spans-auto_identifiers"
               "-implicit_header_references-citations-smart",
        outputfile=str(docx),
        extra_args=["--reference-doc", str(ref), "--resource-path", str(THESIS),
                    "--shift-heading-level-by=-1", "--wrap=none",
                    "--metadata", f"title={meta['title']}", "--metadata", f"author={meta['author']}"],
    )
    # pandoc writes the title metadata as a Title paragraph only when the source has a title
    # block; we passed metadata through --metadata, so remove a possible Title paragraph.
    doc = Document(str(docx))
    for p in list(doc.paragraphs[:3]):
        if p.style.name in ("Title", "Author"):
            p._element.getparent().remove(p._element)
    doc.core_properties.title = meta["title"]
    doc.core_properties.author = meta["author"]
    doc.save(str(docx))
    pdf = EXPORT / f"{target}.pdf"
    subprocess.run(["powershell.exe", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File",
                    str(ROOT / "scripts" / "docs" / "word_finalize.ps1"), "-Docx", str(docx),
                    "-Pdf", str(pdf)], check=True)
    print(f"Wrote {docx.relative_to(ROOT)} and {pdf.relative_to(ROOT)}")


if __name__ == "__main__":
    for name in sys.argv[1:] or list(DOCS):
        build(name)

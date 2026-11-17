"""Check (and optionally renumber) citations, figures and tables in a thesis manuscript.

    python scripts/docs/check_references.py docs/thesis/BACHELOR_THESIS_DRAFT.md [--renumber]

Checks: every numeric citation [n] has a bibliography entry and every entry is cited; figures
and tables are numbered consecutively within each chapter and each one is mentioned in the
text. --renumber rewrites the citations and the bibliography in order of first citation
(ISO 690 numeric method) and compresses runs such as [5], [6], [7] into [5]–[7].
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

CITE_GROUP = re.compile(r"\[\d+\](?:(?:,\s*|–)\[\d+\])*")


def expand(group: str) -> list[int]:
    nums: list[int] = []
    for part in re.split(r",\s*", group):
        bounds = [int(x) for x in re.findall(r"\d+", part)]
        nums.extend(range(bounds[0], bounds[-1] + 1) if len(bounds) == 2 else bounds)
    return nums


def compress(nums: list[int]) -> str:
    nums = sorted(set(nums))
    out, i = [], 0
    while i < len(nums):
        j = i
        while j + 1 < len(nums) and nums[j + 1] == nums[j] + 1:
            j += 1
        out.append(f"[{nums[i]}]–[{nums[j]}]" if j - i >= 2 else ", ".join(f"[{n}]" for n in nums[i:j + 1]))
        i = j + 1
    return ", ".join(out)


def split(text: str) -> tuple[str, str, str]:
    m = re.search(r"^## (?:\d+ )?(?:Bibliography|References)\s*$", text, re.MULTILINE)
    if not m:
        raise SystemExit("no Bibliography heading")
    end = re.search(r"^## ", text[m.end():], re.MULTILINE)
    stop = m.end() + end.start() if end else len(text)
    return text[:m.end()], text[m.end():stop], text[stop:]


def main() -> None:
    path = Path(sys.argv[1])
    text = path.read_text(encoding="utf-8")
    body, bib, tail = split(text)
    entries = {int(n): line for n, line in re.findall(r"^\[(\d+)\] (.*)$", bib, re.MULTILINE)}
    order: list[int] = []
    for g in CITE_GROUP.findall(body + tail):
        for n in expand(g):
            if n not in order:
                order.append(n)
    missing = [n for n in order if n not in entries]
    uncited = [n for n in entries if n not in order]
    print(f"citations: {len(order)} distinct; entries: {len(entries)}; missing entries: {missing}; uncited entries: {uncited}")

    if "--renumber" in sys.argv and not missing:
        mapping = {old: i + 1 for i, old in enumerate(order)}
        for n in uncited:
            mapping[n] = len(mapping) + 1
        renum = lambda s: CITE_GROUP.sub(lambda m: compress([mapping[n] for n in expand(m.group(0))]), s)
        lines = sorted(entries.items(), key=lambda kv: mapping[kv[0]])
        head = re.split(r"^\[\d+\] ", bib, maxsplit=1, flags=re.MULTILINE)[0]
        new_bib = head + "\n\n".join(f"[{mapping[n]}] {line}" for n, line in lines) + "\n\n"
        path.write_text(renum(body) + new_bib + renum(tail), encoding="utf-8")
        print("renumbered in order of first citation")

    # figures and tables
    for kind in ("Figure", "Table"):
        defined = re.findall(rf"(?:!\[|^\*){kind} (\d+|[A-Z])\.(\d+)", text, re.MULTILINE)
        seen: dict[str, int] = {}
        problems = []
        for chap, num in defined:
            expected = seen.get(chap, 0) + 1
            if int(num) != expected:
                problems.append(f"{kind} {chap}.{num} (expected {chap}.{expected})")
            seen[chap] = int(num)
            mentions = len(re.findall(rf"{kind}s? {chap}\.{num}\b", text))
            if mentions < 2:
                problems.append(f"{kind} {chap}.{num} not referred to in the text")
        print(f"{kind.lower()}s: {len(defined)}; problems: {problems or 'none'}")


if __name__ == "__main__":
    main()

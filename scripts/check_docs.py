#!/usr/bin/env python3
"""Validate the documentation set.

Checks:
  1. Relative Markdown links resolve to existing files and, if given, existing headings.
  2. Every requirement-style ID referenced anywhere is defined in its owning document.
  3. Every Must requirement in the SRS names a milestone and is referenced by the roadmap.
  4. Every ADR file has a Status line and is listed in docs/adr/README.md.

Standard library only. Exit code 1 on any failure.
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DOCS = ROOT / "docs"
FILES = sorted([ROOT / "agents.md", ROOT / "README.md", ROOT / "CLAUDE.md", *DOCS.rglob("*.md")])

# ID prefix -> owning document (definitions are first-cell table entries there).
OWNERS = {
    "BO": DOCS / "requirements/BRD.md",
    "BC": DOCS / "requirements/BRD.md",
    "CAP": DOCS / "requirements/PRD.md",
    "UJ": DOCS / "requirements/PRD.md",
    "RULE": DOCS / "requirements/FRD.md",
    "FR": DOCS / "requirements/SRS.md",
    "NFR": DOCS / "requirements/SRS.md",
    "SEC": DOCS / "requirements/SRS.md",
    "DATA": DOCS / "requirements/SRS.md",
    "IF": DOCS / "requirements/SRS.md",
}
ID_RE = re.compile(r"`((?:BO|BC|CAP|UJ|RULE|NFR|SEC|DATA|IF)-\d+|FR-[A-Z]+-\d+)`")
TASK_RE = re.compile(r"\bM\d+-T\d+\b")
LINK_RE = re.compile(r"(?<!!)\[[^\]]*\]\(([^)\s]+)\)")
RANGE_RE = re.compile(r"`((?:FR-[A-Z]+|[A-Z]+))-(\d+)`\s*…\s*`(?:FR-[A-Z]+|[A-Z]+)-(\d+)`")

errors: list[str] = []


def rel(p: Path) -> str:
    return str(p.relative_to(ROOT))


def strip_code_blocks(text: str) -> str:
    return re.sub(r"```.*?```", "", text, flags=re.S)


def slugify(heading: str) -> str:
    h = heading.strip().lower().replace("`", "")
    h = re.sub(r"[^\w\- ]", "", h)
    return h.replace(" ", "-")


def anchors(path: Path) -> set[str]:
    seen: dict[str, int] = {}
    out: set[str] = set()
    for line in strip_code_blocks(path.read_text()).splitlines():
        m = re.match(r"^#{1,6}\s+(.*)$", line)
        if not m:
            continue
        s = slugify(m.group(1))
        n = seen.get(s, 0)
        out.add(s if n == 0 else f"{s}-{n}")
        seen[s] = n + 1
    return out


def check_links() -> None:
    cache: dict[Path, set[str]] = {}
    for f in FILES:
        for target in LINK_RE.findall(strip_code_blocks(f.read_text())):
            if re.match(r"^[a-z]+:", target):
                continue  # external URL
            path_part, _, frag = target.partition("#")
            dest = (f.parent / path_part).resolve() if path_part else f
            if not dest.exists():
                errors.append(f"{rel(f)}: broken link -> {target}")
                continue
            if frag and dest.suffix == ".md":
                cache.setdefault(dest, anchors(dest))
                if frag not in cache[dest]:
                    errors.append(f"{rel(f)}: missing anchor -> {target}")


def defined_ids() -> set[str]:
    ids: set[str] = set()
    for prefix, owner in OWNERS.items():
        for line in owner.read_text().splitlines():
            m = re.match(r"^\|\s*`([A-Z]+(?:-[A-Z]+)?-\d+)`\s*\|", line)
            if m and m.group(1).split("-")[0] == prefix:
                ids.add(m.group(1))
    return ids


def check_ids(defined: set[str]) -> None:
    for f in FILES:
        for ref in ID_RE.findall(f.read_text()):
            if ref not in defined:
                errors.append(f"{rel(f)}: undefined ID {ref}")
    roadmap = (DOCS / "ROADMAP.md").read_text()
    tasks_defined = set(re.findall(r"^\|\s*(M\d+-T\d+)\s*\|", roadmap, flags=re.M))
    for f in FILES:
        for t in TASK_RE.findall(f.read_text()):
            if t not in tasks_defined:
                errors.append(f"{rel(f)}: undefined roadmap task {t}")


def expand_refs(text: str) -> set[str]:
    refs = set(ID_RE.findall(text))
    for prefix, lo, hi in RANGE_RE.findall(text):
        refs.update(f"{prefix}-{i}" for i in range(int(lo), int(hi) + 1))
    return refs


def check_coverage() -> None:
    srs = (DOCS / "requirements/SRS.md").read_text()
    roadmap_refs = expand_refs((DOCS / "ROADMAP.md").read_text())
    for line in srs.splitlines():
        cells = [c.strip() for c in line.strip().strip("|").split("|")]
        if len(cells) < 6 or not re.fullmatch(r"`[A-Z]+(-[A-Z]+)?-\d+`", cells[0]):
            continue
        rid = cells[0].strip("`")
        if "Must" not in cells:
            continue
        if not any(re.search(r"\bM\d\b", c) for c in cells):
            errors.append(f"SRS: Must requirement {rid} has no milestone")
        if rid not in roadmap_refs:
            errors.append(f"ROADMAP: Must requirement {rid} is not referenced by any milestone")


def check_adrs() -> None:
    adr_dir = DOCS / "adr"
    index = (adr_dir / "README.md").read_text()
    for f in sorted(adr_dir.glob("[0-9][0-9][0-9][0-9]-*.md")):
        if not re.search(r"^- \*\*Status:\*\* ", f.read_text(), flags=re.M):
            errors.append(f"{rel(f)}: missing Status line")
        if f"({f.name})" not in index:
            errors.append(f"docs/adr/README.md: {f.name} not listed in index")


def main() -> int:
    defined = defined_ids()
    check_links()
    check_ids(defined)
    check_coverage()
    check_adrs()
    if errors:
        print(f"check_docs: {len(errors)} problem(s)")
        for e in errors:
            print("  -", e)
        return 1
    print(f"check_docs: OK ({len(FILES)} files, {len(defined)} requirement IDs)")
    return 0


if __name__ == "__main__":
    sys.exit(main())

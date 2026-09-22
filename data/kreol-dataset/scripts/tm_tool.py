#!/usr/bin/env python3
"""
Translation memory tool for FraudLens's Kreol Morisien work.

The CSV at data/kreol-dataset/translation-memory.csv is the single source
of truth the project owner (a Kreol Morisien speaker) edits by hand. This
script only converts and validates -- it never rewrites the owner's
approved kreol_morisien text.

Ported from a prior Kreol project's tm_tool.py, adapted for this repo's
layout and domain set.

Usage:
    python tm_tool.py to-jsonl     # CSV -> canonical JSONL
    python tm_tool.py to-csv       # JSONL -> CSV (round-trip, for repair only)
    python tm_tool.py check        # validate only, exit 1 on hard errors
"""

from __future__ import annotations

import csv
import json
import re
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]
CSV_PATH = REPO_ROOT / "data" / "kreol-dataset" / "translation-memory.csv"
JSONL_PATH = REPO_ROOT / "data" / "kreol-dataset" / "translation-memory.jsonl"

FIELDS = ["english", "kreol_morisien", "domain", "status", "reviewed_by", "notes"]
VALID_STATUSES = {"owner_reviewed", "ported_reviewed", "draft_generated", "rejected"}
VALID_DOMAINS = {"banking", "scam", "mobile-money", "ui", "general"}

# Grammatical markers and vocabulary that are Haitian Creole, not Kreol
# Morisien.
HAITIAN_MARKERS = ["mwen", "yon", "gen", "nan", "ap", "bezwen", "kounye a", "nou pral", "jwenn", "kle"]

# Common French-only words/spellings that indicate drift rather than real
# Kreol Morisien. Heuristic only -- flags for owner review, never blocks.
FRENCH_HEAVY_MARKERS = [
    "près de", "avek", "lentement", "désactivé", "tout de suite", "envoye",
    "transfére", "transféré", "la mer", "un", "une", "être", "était", "cette",
]


class TmError(Exception):
    pass


def read_csv(path: Path) -> list[dict[str, str]]:
    with path.open("r", encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        if reader.fieldnames != FIELDS:
            raise TmError(f"CSV header must be exactly {FIELDS}, got {reader.fieldnames}")
        return [dict(row) for row in reader]


def read_jsonl(path: Path) -> list[dict[str, str]]:
    rows = []
    with path.open("r", encoding="utf-8") as f:
        for line_no, line in enumerate(f, start=1):
            line = line.strip()
            if line == "":
                continue
            try:
                rows.append(json.loads(line))
            except json.JSONDecodeError as e:
                raise TmError(f"{path}:{line_no}: invalid JSON -- {e}") from e
    return rows


def write_csv(path: Path, rows: list[dict[str, str]]) -> None:
    with path.open("w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=FIELDS, quoting=csv.QUOTE_MINIMAL)
        writer.writeheader()
        for row in rows:
            writer.writerow({k: row.get(k, "") for k in FIELDS})


def write_jsonl(path: Path, rows: list[dict[str, str]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as f:
        for row in rows:
            f.write(json.dumps({k: row.get(k, "") for k in FIELDS}, ensure_ascii=False))
            f.write("\n")


def normalize_english(text: str) -> str:
    return re.sub(r"\s+", " ", text.strip().lower())


def find_markers(text: str, markers: list[str]) -> list[str]:
    """Word-boundary match so e.g. banned 'ap' does not false-positive inside a longer word."""
    lowered = text.lower()
    hits = []
    for marker in markers:
        pattern = r"(?<!\w)" + re.escape(marker) + r"(?!\w)"
        if re.search(pattern, lowered):
            hits.append(marker)
    return hits


def validate(rows: list[dict[str, str]]) -> tuple[list[str], list[str]]:
    """Returns (errors, warnings). Errors should fail CI; warnings are for owner review."""
    errors: list[str] = []
    warnings: list[str] = []
    seen_english: dict[str, int] = {}

    for i, row in enumerate(rows, start=1):
        english = (row.get("english") or "").strip()
        kreol = (row.get("kreol_morisien") or "").strip()
        status = (row.get("status") or "").strip()
        domain = (row.get("domain") or "").strip()

        if english == "":
            errors.append(f"row {i}: missing english")
        if kreol == "":
            errors.append(f"row {i}: missing kreol_morisien")
        if status not in VALID_STATUSES:
            errors.append(f"row {i}: status must be one of {sorted(VALID_STATUSES)}, got {status!r}")
        if status == "owner_reviewed" and (row.get("reviewed_by") or "").strip() == "":
            errors.append(f"row {i}: status=owner_reviewed requires a non-empty reviewed_by")
        if domain not in VALID_DOMAINS:
            warnings.append(f"row {i}: domain {domain!r} is not in the known set {sorted(VALID_DOMAINS)}")

        if english != "":
            key = normalize_english(english)
            if key in seen_english:
                errors.append(f"row {i}: duplicate english (also row {seen_english[key]}): {english!r}")
            else:
                seen_english[key] = i

        if kreol != "":
            haitian_hits = find_markers(kreol, HAITIAN_MARKERS)
            if haitian_hits:
                warnings.append(f"row {i}: possible Haitian Creole markers in kreol_morisien: {haitian_hits} -- {kreol!r}")
            french_hits = find_markers(kreol, FRENCH_HEAVY_MARKERS)
            if french_hits:
                warnings.append(f"row {i}: possible French-heavy phrasing in kreol_morisien: {french_hits} -- {kreol!r}")

    return errors, warnings


def cmd_check() -> int:
    rows = read_csv(CSV_PATH)
    errors, warnings = validate(rows)
    for w in warnings:
        print(f"WARNING: {w}")
    for e in errors:
        print(f"ERROR: {e}")
    counts = {status: sum(1 for r in rows if r.get("status") == status) for status in sorted(VALID_STATUSES)}
    breakdown = ", ".join(f"{n} {status}" for status, n in counts.items())
    print(f"\n{len(rows)} total entries: {breakdown}.")
    if errors:
        print(f"\nFAILED: {len(errors)} error(s).")
        return 1
    print("\nOK.")
    return 0


def cmd_to_jsonl() -> int:
    rows = read_csv(CSV_PATH)
    errors, warnings = validate(rows)
    for w in warnings:
        print(f"WARNING: {w}")
    if errors:
        for e in errors:
            print(f"ERROR: {e}")
        print("\nRefusing to generate JSONL: fix errors in the CSV first.")
        return 1
    write_jsonl(JSONL_PATH, rows)
    print(f"Wrote {len(rows)} entries to {JSONL_PATH}")
    return 0


def cmd_to_csv() -> int:
    rows = read_jsonl(JSONL_PATH)
    errors, warnings = validate(rows)
    for w in warnings:
        print(f"WARNING: {w}")
    if errors:
        for e in errors:
            print(f"ERROR: {e}")
        print("\nRefusing to generate CSV: fix errors in the JSONL first.")
        return 1
    write_csv(CSV_PATH, rows)
    print(f"Wrote {len(rows)} entries to {CSV_PATH}")
    return 0


def main(argv: list[str]) -> int:
    if len(argv) != 2 or argv[1] not in {"to-jsonl", "to-csv", "check"}:
        print(__doc__)
        return 2
    command = argv[1]
    try:
        if command == "check":
            return cmd_check()
        if command == "to-jsonl":
            return cmd_to_jsonl()
        return cmd_to_csv()
    except TmError as e:
        print(f"ERROR: {e}")
        return 1


if __name__ == "__main__":
    sys.exit(main(sys.argv))

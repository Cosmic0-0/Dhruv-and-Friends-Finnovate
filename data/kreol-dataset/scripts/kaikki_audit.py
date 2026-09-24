#!/usr/bin/env python3
"""Audit kaikki.org Mauritian Creole dictionary dump (Wiktionary extract), read-only.

Input : data/kreol-dataset/additional/kaikki.org-dictionary-MauritianCreole.jsonl
Output: data/kreol-derived/reports/kaikki-audit.json
        data/kreol-derived/lexical-resource.jsonl  (one row per headword+pos, provenance kept)
        (spelling variants are built and classified by build_variant_resource.py)

Kaikki is a LEXICAL resource: entries are word -> glosses. Nothing here is a
sentence translation, and nothing is marked reviewed. status = external_kaikki.
Deterministic: sorted output, no timestamps.
"""
import json
import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / "kreol-dataset" / "additional" / "kaikki.org-dictionary-MauritianCreole.jsonl"
OUT = ROOT / "kreol-derived"
REPORTS = OUT / "reports"


def glosses(r):
    out = []
    for s in r.get("senses", []):
        out.extend(g for g in s.get("glosses", []) if g)
    return out


def bad_header(r):
    return any("incorrect language header" in (c.get("name") or "")
               for s in r.get("senses", []) for c in s.get("categories", []))


def main():
    if not SRC.exists():
        sys.exit(f"missing {SRC}")
    REPORTS.mkdir(parents=True, exist_ok=True)
    rows, malformed = [], 0
    for line in SRC.read_text(encoding="utf-8").split("\n"):
        if not line.strip():
            continue
        try:
            rows.append(json.loads(line))
        except json.JSONDecodeError:
            malformed += 1

    key_counts = Counter(k for r in rows for k in r)
    langs = Counter((r.get("lang"), r.get("lang_code")) for r in rows)
    pos = Counter(r.get("pos") for r in rows)
    words = [r.get("word", "") for r in rows]
    entry_keys = Counter((r.get("word", "").lower(), r.get("pos")) for r in rows)
    sense_keys = Counter(k for r in rows for s in r.get("senses", []) for k in s)
    with_gloss = [r for r in rows if glosses(r)]
    with_alt = [r for r in rows if any("alternative" in f.get("tags", []) for f in r.get("forms", []))]
    form_tags = Counter(t for r in rows for f in r.get("forms", []) for t in f.get("tags", []))
    sense_tags = Counter(t for r in rows for s in r.get("senses", []) for t in s.get("tags", []))
    cats = Counter(c.get("name") for r in rows for s in r.get("senses", []) for c in s.get("categories", []))

    audit = {
        "source": SRC.name,
        "total_rows": len(rows),
        "malformed_lines": malformed,
        "languages": {f"{a}/{b}": c for (a, b), c in langs.items()},
        "unique_lemmas_case_folded": len({w.lower() for w in words if w}),
        "duplicate_word_pos_pairs": sum(c - 1 for c in entry_keys.values() if c > 1),
        "top_level_keys": dict(key_counts.most_common()),
        "sense_keys": dict(sense_keys.most_common()),
        "pos_counts": dict(pos.most_common()),
        "entries_with_english_gloss": len(with_gloss),
        "entries_without_gloss": len(rows) - len(with_gloss),
        "entries_with_multiple_senses": sum(1 for r in rows if len(r.get("senses", [])) > 1),
        "entries_with_forms": sum(1 for r in rows if r.get("forms")),
        "entries_with_alternative_forms": len(with_alt),
        "entries_with_examples": sum(1 for r in rows if any(s.get("examples") for s in r.get("senses", []))),
        "total_examples": sum(len(s.get("examples", [])) for r in rows for s in r.get("senses", [])),
        "entries_with_etymology": sum(1 for r in rows if r.get("etymology_text")),
        "multi_word_headwords": sum(1 for w in words if " " in w),
        "form_of_or_alt_of_senses": sum(1 for r in rows for s in r.get("senses", [])
                                        if s.get("form_of") or s.get("alt_of")),
        "form_tags": dict(form_tags.most_common(20)),
        "sense_tags_top": dict(sense_tags.most_common(20)),
        "entries_with_incorrect_language_header": sum(1 for r in rows if bad_header(r)),
        "top_categories": dict(cats.most_common(15)),
    }
    (REPORTS / "kaikki-audit.json").write_text(json.dumps(audit, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    lex = []
    for r in rows:
        w = r.get("word", "")
        if not w:
            continue
        alts = sorted({f["form"] for f in r.get("forms", [])
                       if "alternative" in f.get("tags", []) and f.get("form")})
        lex.append({"lemma": w, "pos": r.get("pos"), "english": glosses(r)[:6], "variants": alts,
                    "etymology": r.get("etymology_text"), "source": "kaikki", "status": "external_kaikki",
                    "flags": ["incorrect_language_header"] if bad_header(r) else []})
    lex.sort(key=lambda x: (x["lemma"].lower(), x["pos"] or "", json.dumps(x["english"], ensure_ascii=False)))
    with (OUT / "lexical-resource.jsonl").open("w", encoding="utf-8", newline="\n") as f:
        for x in lex:
            f.write(json.dumps(x, ensure_ascii=False) + "\n")
    print(json.dumps(audit, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()

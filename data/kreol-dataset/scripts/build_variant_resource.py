#!/usr/bin/env python3
"""Build the classified Kreol spelling-variant resource used by the normalizer.

Inputs (read-only):
  data/kreol-dataset/additional/kaikki.org-dictionary-MauritianCreole.jsonl
  data/kreol-dataset/additional/2022.findings-aacl.3.Dataset.zip   (TRAIN sides only)

Outputs:
  data/kreol-derived/spelling-variants.classified.json
  data/kreol-derived/candidate-spelling-variants.csv   (human review queue, refreshed)

Candidate pairs come from Kaikki: (a) entries whose sense says "alternative
spelling of X" (alt_of), (b) "Medial form of X" glosses. Each pair is then
classified by how the variant token behaves in MorisienMT *training* text:

  kreolCount  occurrences on the Kreol side (train.*-cr.cr)
  otherCount  occurrences on the English + French sides (train.*.en / train.*.fr)

  safe               token is never/rarely English or French (other/kreol < 0.5%)
                     and is longer than 2 letters -> may be rewritten in matching text
  ambiguous          real Kreol spelling that collides with an English/French word,
                     or a 1-2 letter token -> rewritten ONLY when the surrounding
                     message is Kreol-dominant (see kreol/normalizer.js)
  do_not_normalize   unattested in Kreol training text (<3) or mostly English/French
                     (other >= 50% of kreol) -> never rewritten

Kaikki has gaps (no entry for pa, pann, bank, kod ...), so a missing entry means
"unknown", never "invalid". Nothing here is human reviewed: every row is
status "external_candidate" with source "kaikki" and the numbers that produced its
class. Dev/test splits are never read.
"""
import csv
import json
import re
import sys
import zipfile
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]  # data/
KAIKKI = ROOT / "kreol-dataset" / "additional" / "kaikki.org-dictionary-MauritianCreole.jsonl"
ZIP = ROOT / "kreol-dataset" / "additional" / "2022.findings-aacl.3.Dataset.zip"
OUT = ROOT / "kreol-derived"

TOKEN = re.compile(r"[\w'’-]+", re.UNICODE)
KREOL_SIDES = ["MorisienMT/train.en-cr.cr", "MorisienMT/train.fr-cr.cr"]
OTHER_SIDES = ["MorisienMT/train.en-cr.en", "MorisienMT/train.fr-cr.fr"]
MEDIAL = re.compile(r"^Medial form of (\S+)", re.I)


def count_tokens(zf, names):
    c = Counter()
    for n in names:
        for line in zf.read(n).decode("utf-8").split("\n"):
            c.update(t.lower() for t in TOKEN.findall(line))
    return c


def candidate_pairs():
    pairs = {}  # (canonical, variant) -> kind
    for line in KAIKKI.read_text(encoding="utf-8").split("\n"):
        if not line.strip():
            continue
        e = json.loads(line)
        word = e.get("word", "")
        for s in e.get("senses", []):
            for a in s.get("alt_of", []) or []:
                canon = a.get("word")
                if canon:
                    pairs[(canon, word)] = "alternative_spelling"
            for g in s.get("glosses", []):
                m = MEDIAL.match(g)
                if m:
                    pairs[(m.group(1), word)] = "medial_form"
    return pairs


def classify(kreol, other, variant):
    if kreol < 3:
        return "do_not_normalize", "unattested in Kreol training text"
    if other >= 0.5 * kreol:
        return "do_not_normalize", "mostly an English/French word"
    if len(variant) <= 2:
        return "ambiguous", "1-2 letter token (texting shorthand / short function word)"
    if other / kreol >= 0.005:
        return "ambiguous", "also occurs in English/French text"
    return "safe", "Kreol-only in training text"


def main():
    for p in (KAIKKI, ZIP):
        if not p.exists():
            sys.exit(f"missing {p}")
    zf = zipfile.ZipFile(ZIP)
    kc, oc = count_tokens(zf, KREOL_SIDES), count_tokens(zf, OTHER_SIDES)
    rows = []
    for (canon, variant), kind in sorted(candidate_pairs().items()):
        c, v = canon.lower(), variant.lower()
        # single lowercase-able tokens only; multi-word or proper-noun pairs are not token respellings
        if " " in canon or " " in variant or c == v or not TOKEN.fullmatch(c) or not TOKEN.fullmatch(v):
            continue
        if canon[:1].isupper() or variant[:1].isupper():
            continue
        safety, why = classify(kc[v], oc[v], v)
        rows.append({
            "canonical": c, "variant": v, "kind": kind, "safety": safety, "reason": why,
            "kreolCount": kc[v], "otherCount": oc[v], "canonicalKreolCount": kc[c],
            "source": "kaikki", "evidence": "MorisienMT train counts", "status": "external_candidate",
        })
    order = {"ambiguous": 0, "safe": 1, "do_not_normalize": 2}
    rows.sort(key=lambda r: (order[r["safety"]], -r["kreolCount"], r["canonical"], r["variant"]))  # review the rows that change behaviour first
    counts = Counter(r["safety"] for r in rows)
    doc = {
        "about": "Kaikki-derived spelling variants classified by MorisienMT training-text behaviour. "
                 "Candidate evidence only - not human reviewed. Regenerate with scripts/build_variant_resource.py.",
        "counts": dict(sorted(counts.items())), "variants": rows,
    }
    (OUT / "spelling-variants.classified.json").write_text(json.dumps(doc, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    with (OUT / "candidate-spelling-variants.csv").open("w", encoding="utf-8", newline="") as f:
        w = csv.writer(f)
        w.writerow(["canonical", "variant", "kind", "auto_safety", "reason", "kreol_count", "other_count", "source", "reviewer_decision", "notes"])
        for r in rows:
            w.writerow([r["canonical"], r["variant"], r["kind"], r["safety"], r["reason"], r["kreolCount"], r["otherCount"], "kaikki", "", ""])
    print(json.dumps(doc["counts"]))
    for r in rows:
        if r["variant"] in {"nu", "pu", "u", "en", "in", "gagn", "ganye", "sa", "ou", "mo"} or r["canonical"] in {"nou", "pou", "ou", "enn", "inn"}:
            print(r["canonical"], "<-", r["variant"], r["kind"], r["safety"], r["kreolCount"], r["otherCount"])


if __name__ == "__main__":
    main()

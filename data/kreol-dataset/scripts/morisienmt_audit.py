#!/usr/bin/env python3
"""Audit + classify MorisienMT (AACL 2022 findings) without modifying the raw zip.

Reads data/kreol-dataset/additional/2022.findings-aacl.3.Dataset.zip in place and
writes derived files under data/kreol-derived/:

  reports/morisienmt-audit.json      exact counts, duplicates, length stats, leakage
  reports/morisienmt-quality.json    per-classification counts per direction
  morisienmt-clean.jsonl             rows classified natural_sentence / short_phrase
  morisienmt-lexical.jsonl           single_word_gloss / dictionary_definition (lexical-only)
  morisienmt-rejected.jsonl          duplicate / suspected_misalignment / invalid
  suspected-misaligned-morisienmt.csv  human-review queue (uncertain rows only)

dev/test are NEVER written to the clean/lexical files. They are audited only and
stay frozen. Every derived row carries provenance (sourceDataset, split, direction,
classification) and status "external_morisienmt" - never a FraudLens review status.
Deterministic: same input -> byte-identical output.
"""
import csv
import json
import re
import statistics
import sys
import zipfile
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]  # data/
ZIP_PATH = ROOT / "kreol-dataset" / "additional" / "2022.findings-aacl.3.Dataset.zip"
OUT = ROOT / "kreol-derived"
REPORTS = OUT / "reports"
PREFIX = "MorisienMT/"

# (split, direction, source-file, target-file); "cr" is Morisien = mfe in FraudLens.
TRAIN_PAIRS = [
    ("train", "mfe-en", "train.en-cr.cr", "train.en-cr.en"),
    ("train", "mfe-fr", "train.fr-cr.cr", "train.fr-cr.fr"),
]
EVAL_SPLITS = ["dev", "test"]
LANG_EXT = {"mfe": "cr", "en": "en", "fr": "fr"}

WORD_RE = re.compile(r"[\w'-]+", re.UNICODE)


def read_lines(zf, name):
    raw = zf.read(PREFIX + name).decode("utf-8")
    lines = raw.split("\n")
    if lines and lines[-1] == "":
        lines.pop()
    return [l.rstrip("\r") for l in lines]


def norm(s):
    return re.sub(r"\s+", " ", s.strip().lower())


def wc(s):
    return len(WORD_RE.findall(s))


def classify(src, tgt):
    """Return (classification, flags). Conservative: uncertain -> suspected_misalignment."""
    flags = []
    s, t = src.strip(), tgt.strip()
    if not s or not t:
        return "invalid", ["empty_side"]
    if not re.search(r"[^\W\d_]", s) or not re.search(r"[^\W\d_]", t):
        return "invalid", ["no_letters"]
    if "�" in s or "�" in t:
        return "invalid", ["replacement_char"]
    sw, tw = wc(s), wc(t)
    if norm(s) == norm(t) and sw > 3:
        flags.append("source_equals_target")
    lo, hi = min(sw, tw), max(sw, tw)
    if hi >= 6 and lo > 0 and hi / lo > 3.0:
        flags.append("length_ratio_gt_3")
    if hi >= 4 and lo == 0:
        flags.append("empty_words")
    if flags:
        return "suspected_misalignment", flags
    if sw == 1 and tw == 1:
        return "single_word_gloss", flags
    if (sw <= 2 and tw >= 6) or (tw <= 2 and sw >= 6):
        return "dictionary_definition", flags
    if sw <= 2 and tw <= 2:
        return "single_word_gloss" if lo == 1 else "short_phrase", flags
    if sw <= 4 and tw <= 4:
        return "short_phrase", flags
    return "natural_sentence", flags


def length_stats(values):
    if not values:
        return {}
    v = sorted(values)
    return {"min": v[0], "max": v[-1], "mean": round(statistics.mean(v), 2),
            "median": statistics.median(v), "p95": v[int(0.95 * (len(v) - 1))]}


def main():
    if not ZIP_PATH.exists():
        sys.exit(f"missing {ZIP_PATH}")
    REPORTS.mkdir(parents=True, exist_ok=True)
    zf = zipfile.ZipFile(ZIP_PATH)
    members = sorted(i.filename for i in zf.infolist()
                     if i.filename.startswith(PREFIX) and not i.is_dir())

    audit = {"zip": ZIP_PATH.name, "members": members, "files": {}, "splits": {}}
    quality = {}
    clean, lexical, rejected, review_queue = [], [], [], []
    seen = set()

    frozen = {}
    for split in EVAL_SPLITS:
        frozen[split] = {lang: read_lines(zf, f"{split}.{ext}") for lang, ext in LANG_EXT.items()}
        lens = {k: len(v) for k, v in frozen[split].items()}
        audit["splits"][split] = {"line_counts": lens, "aligned_3way": len(set(lens.values())) == 1}

    train_src = defaultdict(set)
    train_tgt = defaultdict(set)

    for split, direction, sf, tf in TRAIN_PAIRS:
        src, tgt = read_lines(zf, sf), read_lines(zf, tf)
        if len(src) != len(tgt):
            sys.exit(f"{direction}: line count mismatch {len(src)} vs {len(tgt)}")
        info = {"source_file": sf, "target_file": tf, "lines": len(src)}
        cls_counts, flag_counts = Counter(), Counter()
        dup_pairs = 0
        src_seen, tgt_seen = Counter(norm(x) for x in src), Counter(norm(x) for x in tgt)
        sw_lens, tw_lens, ratios = [], [], []
        for i, (s, t) in enumerate(zip(src, tgt), start=1):
            cls, flags = classify(s, t)
            key = (direction, norm(s), norm(t))
            if cls != "invalid" and key in seen:
                dup_pairs += 1
                cls, flags = "duplicate", flags + ["exact_duplicate_pair"]
            seen.add(key)
            sw, tw = wc(s), wc(t)
            sw_lens.append(sw)
            tw_lens.append(tw)
            if sw and tw:
                ratios.append(round(max(sw, tw) / min(sw, tw), 2))
            cls_counts[cls] += 1
            for f in flags:
                flag_counts[f] += 1
            row = {"sourceDataset": "MorisienMT", "split": split, "direction": direction, "line": i,
                   "source": s, "target": t, "classification": cls, "qualityFlags": flags,
                   "status": "external_morisienmt"}
            if cls in ("natural_sentence", "short_phrase"):
                clean.append(row)
            elif cls in ("single_word_gloss", "dictionary_definition"):
                lexical.append(row)
            else:
                rejected.append(row)
            if cls == "suspected_misalignment":
                review_queue.append(row)
            train_src[direction].add(norm(s))
            train_tgt[direction].add(norm(t))
        info.update({
            "classification": dict(sorted(cls_counts.items())),
            "flags": dict(sorted(flag_counts.items())),
            "exact_duplicate_pairs": dup_pairs,
            "duplicate_source_sentences": sum(c - 1 for c in src_seen.values() if c > 1),
            "duplicate_target_sentences": sum(c - 1 for c in tgt_seen.values() if c > 1),
            "source_word_len": length_stats(sw_lens),
            "target_word_len": length_stats(tw_lens),
            "length_ratio": length_stats(ratios),
            "single_word_source_lines": sum(1 for x in sw_lens if x == 1),
        })
        audit["files"][direction] = info
        quality[direction] = dict(sorted(cls_counts.items()))

    leak = {}
    for split in EVAL_SPLITS:
        block = frozen[split]
        cls_counts = Counter(classify(cr, en)[0] for cr, en in zip(block["mfe"], block["en"]))
        leak[split] = {
            "mfe_en_classification": dict(sorted(cls_counts.items())),
            "mfe_seen_in_train_mfe-en_source": sum(1 for x in block["mfe"] if norm(x) in train_src["mfe-en"]),
            "mfe_seen_in_train_mfe-fr_source": sum(1 for x in block["mfe"] if norm(x) in train_src["mfe-fr"]),
            "en_seen_in_train_mfe-en_target": sum(1 for x in block["en"] if norm(x) in train_tgt["mfe-en"]),
            "fr_seen_in_train_mfe-fr_target": sum(1 for x in block["fr"] if norm(x) in train_tgt["mfe-fr"]),
            "empty_lines": {k: sum(1 for x in v if not x.strip()) for k, v in block.items()},
            "word_len": {k: length_stats([wc(x) for x in v]) for k, v in block.items()},
        }
    audit["frozen_split_audit"] = leak
    audit["annotation_workbook"] = ("Creole MT evaluation Annotations.xlsx: 50 examples x 4 directions, "
                                    "human eval of the paper's NMT system; not used as data")

    (REPORTS / "morisienmt-audit.json").write_text(json.dumps(audit, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    (REPORTS / "morisienmt-quality.json").write_text(json.dumps(quality, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    for name, rows in (("morisienmt-clean", clean), ("morisienmt-lexical", lexical), ("morisienmt-rejected", rejected)):
        with (OUT / f"{name}.jsonl").open("w", encoding="utf-8", newline="\n") as f:
            for r in rows:
                f.write(json.dumps(r, ensure_ascii=False) + "\n")
    with (OUT / "suspected-misaligned-morisienmt.csv").open("w", encoding="utf-8", newline="") as f:
        w = csv.writer(f)
        w.writerow(["direction", "line", "source", "target", "flags"])
        for r in review_queue:
            w.writerow([r["direction"], r["line"], r["source"], r["target"], "|".join(r["qualityFlags"])])
    # Evaluation-only export of the DEV split (3-way aligned) for translation smoke tests.
    # The frozen TEST split is intentionally never materialised outside the raw zip.
    eval_dir = ROOT / "evaluation" / "kreol"
    eval_dir.mkdir(parents=True, exist_ok=True)
    with (eval_dir / "morisienmt-dev.jsonl").open("w", encoding="utf-8", newline="\n") as f:
        for i, (cr, en, fr) in enumerate(zip(frozen["dev"]["mfe"], frozen["dev"]["en"], frozen["dev"]["fr"]), start=1):
            f.write(json.dumps({"id": f"MMT-DEV-{i:04d}", "split": "dev", "sourceDataset": "MorisienMT",
                                "mfe": cr, "en": en, "fr": fr, "use": "translation_evaluation_only"}, ensure_ascii=False) + "\n")
    print(json.dumps({"quality": quality, "frozen": leak}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()

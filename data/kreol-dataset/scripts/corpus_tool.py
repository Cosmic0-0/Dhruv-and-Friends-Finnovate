#!/usr/bin/env python3
"""
Sentence/message-level scam corpus tool for FraudLens's Kreol Morisien work.

The CSV at data/kreol-dataset/scam-corpus.csv is the single source of
truth. Unlike translation-memory.csv (terminology / short phrase
mappings), this corpus holds complete realistic scam messages in context
so the Kreol layer can be tested against what the fraud-analysis pipeline
actually needs: entity preservation, risk-signal preservation, code-switch
handling.

This script is new, but reuses tm_tool.py's proven Haitian/French
drift heuristics rather than re-deriving them (see the import below) and
mirrors its CSV/JSONL/check/to-jsonl shape for consistency.

Usage:
    python corpus_tool.py check      # validate only, exit 1 on hard errors
    python corpus_tool.py stats      # print corpus coverage breakdown
    python corpus_tool.py to-jsonl   # CSV -> canonical JSONL
"""

from __future__ import annotations

import csv
import json
import re
import sys
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from tm_tool import FRENCH_HEAVY_MARKERS, HAITIAN_MARKERS, find_markers  # noqa: E402

REPO_ROOT = Path(__file__).resolve().parents[3]
CSV_PATH = REPO_ROOT / "data" / "kreol-dataset" / "scam-corpus.csv"
JSONL_PATH = REPO_ROOT / "data" / "kreol-dataset" / "scam-corpus.jsonl"

FIELDS = [
    "id", "original_message", "language_mix", "english_meaning", "scam_type",
    "risk_signals", "entities", "status", "reviewed_by", "provenance", "notes",
]

ID_PATTERN = re.compile(r"^FL-KM-\d{4}$")

VALID_LANGUAGE_MIX = {"mfe", "mfe+en", "mfe+fr", "mfe+en+fr", "en", "fr"}

VALID_SCAM_TYPES = {
    "bank_impersonation", "government_impersonation", "otp_theft",
    "account_verification", "payment_request", "refund_scam",
    "parcel_customs", "family_impersonation", "changed_number",
    "investment", "job_scam", "prize_lottery", "phishing",
    "merchant_payment_change", "other", "legitimate",
}

VALID_RISK_SIGNALS = {
    "URGENCY", "THREAT", "SECRECY", "AUTHORITY_PRESSURE", "OTP_REQUEST",
    "SENSITIVE_INFO_REQUEST", "PAYMENT_REQUEST", "UNEXPECTED_PAYMENT",
    "IMPERSONATION", "UNKNOWN_SENDER", "NEW_PHONE_NUMBER", "DOMAIN_MISMATCH",
    "LOOKALIKE_DOMAIN", "SHORTENED_URL", "SUSPICIOUS_URL",
    "BENEFICIARY_MISMATCH", "CHANGED_PAYMENT_DETAILS", "GUARANTEED_RETURN",
    "PRIZE_LURE", "REFUND_LURE", "PARCEL_FEE", "CRYPTO_REQUEST",
    "UNVERIFIED_IDENTITY",
}

VALID_STATUSES = {"owner_reviewed", "ported_reviewed", "draft_generated", "rejected"}
VALID_PROVENANCE = {"synthetic_claude", "owner_authored", "real_report_redacted"}

OTP_WORDING = re.compile(r"\botp\b|\bpin\b|\bcode\b|\bkod\b", re.IGNORECASE)
LONG_DIGIT_RUN = re.compile(r"\d{9,}")


class CorpusError(Exception):
    pass


def read_csv(path: Path) -> list[dict[str, str]]:
    with path.open("r", encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        if reader.fieldnames != FIELDS:
            raise CorpusError(f"CSV header must be exactly {FIELDS}, got {reader.fieldnames}")
        return [dict(row) for row in reader]


def write_jsonl(path: Path, rows: list[dict[str, object]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as f:
        for row in rows:
            f.write(json.dumps(row, ensure_ascii=False))
            f.write("\n")


def normalize_text(text: str) -> str:
    return re.sub(r"\s+", " ", text.strip().lower())


def parse_risk_signals(raw: str) -> list[str]:
    raw = raw.strip()
    return [] if raw == "" else raw.split("|")


def validate(rows: list[dict[str, str]]) -> tuple[list[str], list[str]]:
    """Returns (errors, warnings). Errors should fail CI; warnings are for owner review."""
    errors: list[str] = []
    warnings: list[str] = []
    seen_ids: dict[str, int] = {}
    seen_english_meaning: dict[str, int] = {}
    seen_original_message: dict[str, int] = {}

    for i, row in enumerate(rows, start=1):
        row_id = (row.get("id") or "").strip()
        original_message = (row.get("original_message") or "").strip()
        language_mix = (row.get("language_mix") or "").strip()
        english_meaning = (row.get("english_meaning") or "").strip()
        scam_type = (row.get("scam_type") or "").strip()
        risk_signals_raw = (row.get("risk_signals") or "").strip()
        entities_raw = (row.get("entities") or "").strip()
        status = (row.get("status") or "").strip()
        reviewed_by = (row.get("reviewed_by") or "").strip()
        provenance = (row.get("provenance") or "").strip()

        if not ID_PATTERN.match(row_id):
            errors.append(f"row {i}: id must match FL-KM-\\d{{4}}, got {row_id!r}")
        elif row_id in seen_ids:
            errors.append(f"row {i}: duplicate id (also row {seen_ids[row_id]}): {row_id!r}")
        else:
            seen_ids[row_id] = i

        if original_message == "":
            errors.append(f"row {i}: missing original_message")
        else:
            key = normalize_text(original_message)
            if key in seen_original_message:
                warnings.append(f"row {i}: near-duplicate original_message (also row {seen_original_message[key]})")
            else:
                seen_original_message[key] = i

        if english_meaning == "":
            errors.append(f"row {i}: missing english_meaning")
        else:
            key = normalize_text(english_meaning)
            if key in seen_english_meaning:
                warnings.append(f"row {i}: duplicate english_meaning (also row {seen_english_meaning[key]})")
            else:
                seen_english_meaning[key] = i

        if language_mix not in VALID_LANGUAGE_MIX:
            errors.append(f"row {i}: language_mix must be one of {sorted(VALID_LANGUAGE_MIX)}, got {language_mix!r}")

        if scam_type not in VALID_SCAM_TYPES:
            errors.append(f"row {i}: scam_type must be one of {sorted(VALID_SCAM_TYPES)}, got {scam_type!r}")

        signals = parse_risk_signals(risk_signals_raw)
        unknown_signals = [s for s in signals if s not in VALID_RISK_SIGNALS]
        if unknown_signals:
            errors.append(f"row {i}: unknown risk_signals {unknown_signals}")
        if len(signals) != len(set(signals)):
            errors.append(f"row {i}: duplicate risk_signals in {signals}")
        if scam_type == "legitimate" and signals:
            warnings.append(f"row {i}: scam_type=legitimate but risk_signals is non-empty: {signals}")
        if scam_type != "legitimate" and not signals:
            warnings.append(f"row {i}: scam_type={scam_type!r} but risk_signals is empty")
        if "OTP_REQUEST" in signals and not OTP_WORDING.search(original_message):
            warnings.append(f"row {i}: OTP_REQUEST signal but no OTP/PIN/code wording found in original_message")
        if "DOMAIN_MISMATCH" in signals and "url" not in entities_raw and "domain" not in entities_raw:
            warnings.append(f"row {i}: DOMAIN_MISMATCH signal but entities has no url/domain context")

        try:
            entities = json.loads(entities_raw) if entities_raw != "" else {}
            if not isinstance(entities, dict):
                errors.append(f"row {i}: entities must be a JSON object, got {type(entities).__name__}")
        except json.JSONDecodeError as e:
            errors.append(f"row {i}: entities is not valid JSON -- {e}")

        if status not in VALID_STATUSES:
            errors.append(f"row {i}: status must be one of {sorted(VALID_STATUSES)}, got {status!r}")
        if status == "owner_reviewed" and reviewed_by == "":
            errors.append(f"row {i}: status=owner_reviewed requires a non-empty reviewed_by")
        if status == "draft_generated" and reviewed_by != "":
            warnings.append(f"row {i}: status=draft_generated should not have reviewed_by set, got {reviewed_by!r}")

        if provenance not in VALID_PROVENANCE:
            warnings.append(f"row {i}: provenance {provenance!r} is not in the known set {sorted(VALID_PROVENANCE)}")

        if LONG_DIGIT_RUN.search(original_message):
            warnings.append(f"row {i}: original_message contains a 9+ digit run -- check it is not a real account/ID number")

        haitian_hits = find_markers(original_message, HAITIAN_MARKERS)
        if haitian_hits:
            warnings.append(f"row {i}: possible Haitian Creole markers in original_message: {haitian_hits}")
        french_hits = find_markers(original_message, FRENCH_HEAVY_MARKERS)
        if french_hits and "fr" not in language_mix:
            warnings.append(f"row {i}: possible French-heavy phrasing but language_mix={language_mix!r} does not include fr: {french_hits}")

    return errors, warnings


def cmd_check() -> int:
    rows = read_csv(CSV_PATH)
    errors, warnings = validate(rows)
    for w in warnings:
        print(f"WARNING: {w}")
    for e in errors:
        print(f"ERROR: {e}")
    print(f"\n{len(rows)} total entries.")
    if errors:
        print(f"\nFAILED: {len(errors)} error(s).")
        return 1
    print("OK.")
    return 0


def cmd_stats() -> int:
    rows = read_csv(CSV_PATH)
    print(f"Total rows: {len(rows)}\n")

    status_counts = Counter(r.get("status", "") for r in rows)
    print("Status:")
    for status in sorted(VALID_STATUSES):
        print(f"  {status}: {status_counts.get(status, 0)}")

    mix_counts = Counter(r.get("language_mix", "") for r in rows)
    print("\nLanguage mix:")
    for mix in sorted(VALID_LANGUAGE_MIX):
        if mix_counts.get(mix, 0):
            print(f"  {mix}: {mix_counts[mix]}")

    type_counts = Counter(r.get("scam_type", "") for r in rows)
    print("\nScam types:")
    for scam_type in sorted(VALID_SCAM_TYPES):
        if type_counts.get(scam_type, 0):
            print(f"  {scam_type}: {type_counts[scam_type]}")

    signal_counts: Counter[str] = Counter()
    for r in rows:
        signal_counts.update(parse_risk_signals(r.get("risk_signals", "")))
    print("\nTop risk signals:")
    for signal, count in signal_counts.most_common():
        print(f"  {signal}: {count}")

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

    out_rows = []
    for row in rows:
        entities_raw = (row.get("entities") or "").strip()
        out_rows.append({
            "id": row["id"],
            "original_message": row["original_message"],
            "language_mix": row["language_mix"],
            "english_meaning": row["english_meaning"],
            "scam_type": row["scam_type"],
            "risk_signals": parse_risk_signals(row.get("risk_signals", "")),
            "entities": json.loads(entities_raw) if entities_raw != "" else {},
            "status": row["status"],
            "reviewed_by": row.get("reviewed_by", ""),
            "provenance": row.get("provenance", ""),
            "notes": row.get("notes", ""),
        })
    write_jsonl(JSONL_PATH, out_rows)
    print(f"Wrote {len(out_rows)} entries to {JSONL_PATH}")
    return 0


def main(argv: list[str]) -> int:
    if len(argv) != 2 or argv[1] not in {"check", "stats", "to-jsonl"}:
        print(__doc__)
        return 2
    command = argv[1]
    try:
        if command == "check":
            return cmd_check()
        if command == "stats":
            return cmd_stats()
        return cmd_to_jsonl()
    except CorpusError as e:
        print(f"ERROR: {e}")
        return 1


if __name__ == "__main__":
    sys.exit(main(sys.argv))

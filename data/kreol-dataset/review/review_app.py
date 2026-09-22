#!/usr/bin/env python3
"""Local Streamlit app for collaborative human review of scam-corpus.csv.

Read-only against the source corpus (data/kreol-dataset/scam-corpus.csv).
Reviewer decisions are stored separately, one record per (id, reviewer), in
review-decisions.csv. This app never sets a corpus row to owner_reviewed,
never merges Joshua's and Caellum's reviews, and never writes back to the
corpus -- see CLAUDE.md Critical Rule: Never Fabricate Review.

Run:
    streamlit run data/kreol-dataset/review/review_app.py
"""

from __future__ import annotations

import csv
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

import streamlit as st

REPO_ROOT = Path(__file__).resolve().parents[3]
CORPUS_PATH = REPO_ROOT / "data" / "kreol-dataset" / "scam-corpus.csv"
REVIEW_DECISIONS_PATH = REPO_ROOT / "data" / "kreol-dataset" / "review" / "review-decisions.csv"

sys.path.insert(0, str(REPO_ROOT / "data" / "kreol-dataset" / "scripts"))
from corpus_tool import VALID_RISK_SIGNALS  # noqa: E402

REVIEWERS = ("Joshua", "Caellum")
DECISIONS = ("APPROVE", "EDIT", "REJECT")
REVIEW_FIELDS = [
    "id", "reviewer", "decision", "corrected_original_message",
    "corrected_english_meaning", "signals_to_add", "signals_to_remove",
    "review_notes", "reviewed_at",
]

REVIEW_CHECKLIST = [
    "Does this sound like natural Mauritian Kreol?",
    "Would a Mauritian realistically write/code-switch this way?",
    "Is the English meaning faithful?",
    "Are important fraud cues preserved?",
    "Are important entities preserved?",
    "Are the risk signals supported?",
    "Is the scam type appropriate?",
    "Does anything sound artificial, too French, too English, or non-Mauritian?",
]

# ---------------------------------------------------------------------------
# Pure data helpers -- no Streamlit dependency in signature/behaviour, so
# they can be exercised directly without running the app.
# ---------------------------------------------------------------------------


def load_corpus_rows(path: Path = CORPUS_PATH) -> list[dict[str, str]]:
    with path.open("r", encoding="utf-8-sig", newline="") as f:
        return list(csv.DictReader(f))


def parse_pipe(raw: str) -> list[str]:
    raw = (raw or "").strip()
    return [] if raw == "" else raw.split("|")


def join_pipe(items: list[str]) -> str:
    return "|".join(items)


def parse_entities(raw: str) -> dict:
    raw = (raw or "").strip()
    return json.loads(raw) if raw else {}


def load_review_records(path: Path = REVIEW_DECISIONS_PATH) -> dict[tuple[str, str], dict[str, str]]:
    if not path.exists():
        return {}
    with path.open("r", encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        return {(row["id"], row["reviewer"]): dict(row) for row in reader}


def write_review_records(records: dict[tuple[str, str], dict[str, str]], path: Path = REVIEW_DECISIONS_PATH) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp_path = path.with_name(path.name + ".tmp")
    with tmp_path.open("w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=REVIEW_FIELDS)
        writer.writeheader()
        for key in sorted(records.keys()):
            writer.writerow(records[key])
    tmp_path.replace(path)


def save_review_record(record: dict[str, str], path: Path = REVIEW_DECISIONS_PATH) -> None:
    if record["reviewer"] not in REVIEWERS:
        raise ValueError(f"unknown reviewer {record['reviewer']!r}")
    if record["decision"] not in DECISIONS:
        raise ValueError(f"unknown decision {record['decision']!r}")
    records = load_review_records(path)
    records[(record["id"], record["reviewer"])] = {field: record.get(field, "") for field in REVIEW_FIELDS}
    write_review_records(records, path)


def reviewer_progress(
    reviewer: str,
    corpus_rows: list[dict[str, str]],
    records: dict[tuple[str, str], dict[str, str]],
) -> dict[str, int]:
    counts = {"APPROVE": 0, "EDIT": 0, "REJECT": 0}
    for row in corpus_rows:
        rec = records.get((row["id"], reviewer))
        decision = rec.get("decision") if rec else ""
        if decision in counts:
            counts[decision] += 1
    reviewed = sum(counts.values())
    total = len(corpus_rows)
    return {"reviewed": reviewed, "total": total, "remaining": total - reviewed, **counts}


def filter_rows_for_reviewer(
    corpus_rows: list[dict[str, str]],
    records: dict[tuple[str, str], dict[str, str]],
    reviewer: str,
    filter_name: str,
) -> list[dict[str, str]]:
    def decision_of(row: dict[str, str]) -> str:
        rec = records.get((row["id"], reviewer))
        return rec.get("decision", "") if rec else ""

    if filter_name == "Unreviewed by me":
        return [r for r in corpus_rows if not decision_of(r)]
    if filter_name in DECISIONS:
        return [r for r in corpus_rows if decision_of(r) == filter_name]
    return list(corpus_rows)


def comparison_state(row_id: str, records: dict[tuple[str, str], dict[str, str]]) -> str:
    joshua = records.get((row_id, "Joshua"))
    caellum = records.get((row_id, "Caellum"))
    j_decision = joshua.get("decision", "") if joshua else ""
    c_decision = caellum.get("decision", "") if caellum else ""
    if not j_decision and not c_decision:
        return "BOTH_PENDING"
    if not j_decision or not c_decision:
        return "ONE_REVIEW_PENDING"
    if j_decision == c_decision:
        return {"APPROVE": "AGREED_APPROVE", "EDIT": "AGREED_EDIT", "REJECT": "AGREED_REJECT"}[j_decision]
    return "DISAGREEMENT"


def comparison_summary(
    corpus_rows: list[dict[str, str]],
    records: dict[tuple[str, str], dict[str, str]],
) -> dict[str, int]:
    states = [comparison_state(row["id"], records) for row in corpus_rows]
    return {
        "total": len(corpus_rows),
        "both_reviewed": sum(1 for s in states if s not in ("BOTH_PENDING", "ONE_REVIEW_PENDING")),
        "same_decision": sum(1 for s in states if s.startswith("AGREED_")),
        "disagreements": sum(1 for s in states if s == "DISAGREEMENT"),
        "awaiting_joshua": sum(
            1 for row in corpus_rows
            if not records.get((row["id"], "Joshua")) and records.get((row["id"], "Caellum"))
        ),
        "awaiting_caellum": sum(
            1 for row in corpus_rows
            if not records.get((row["id"], "Caellum")) and records.get((row["id"], "Joshua"))
        ),
        "neither_reviewed": sum(1 for s in states if s == "BOTH_PENDING"),
    }


_COMPARISON_PREDICATES = {
    "All": lambda s: True,
    "Both reviewed": lambda s: s not in ("BOTH_PENDING", "ONE_REVIEW_PENDING"),
    "Same decision": lambda s: s.startswith("AGREED_"),
    "Disagreements": lambda s: s == "DISAGREEMENT",
    "Neither reviewed": lambda s: s == "BOTH_PENDING",
}


def filter_rows_for_comparison(
    corpus_rows: list[dict[str, str]],
    records: dict[tuple[str, str], dict[str, str]],
    filter_name: str,
) -> list[dict[str, str]]:
    if filter_name == "Waiting for Joshua":
        return [
            r for r in corpus_rows
            if not records.get((r["id"], "Joshua")) and records.get((r["id"], "Caellum"))
        ]
    if filter_name == "Waiting for Caellum":
        return [
            r for r in corpus_rows
            if not records.get((r["id"], "Caellum")) and records.get((r["id"], "Joshua"))
        ]
    predicate = _COMPARISON_PREDICATES.get(filter_name, _COMPARISON_PREDICATES["All"])
    return [r for r in corpus_rows if predicate(comparison_state(r["id"], records))]


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def _reviewer_row_key(reviewer: str, row_id: str) -> str:
    return f"{reviewer}::{row_id}"


# ---------------------------------------------------------------------------
# Streamlit UI
# ---------------------------------------------------------------------------


def _render_review_tab(corpus_rows: list[dict[str, str]], records: dict[tuple[str, str], dict[str, str]], reviewer: str) -> None:
    filtered = filter_rows_for_reviewer(corpus_rows, records, reviewer, st.session_state.filter_choice)
    filtered_ids = [r["id"] for r in filtered]

    if not filtered_ids:
        st.warning(f"No rows match filter {st.session_state.filter_choice!r} for {reviewer}.")
        return

    if st.session_state.current_id not in filtered_ids:
        st.session_state.current_id = filtered_ids[0]

    idx = filtered_ids.index(st.session_state.current_id)
    row = next(r for r in corpus_rows if r["id"] == st.session_state.current_id)
    rec = records.get((row["id"], reviewer))
    current_decision = rec.get("decision", "") if rec else ""

    st.title("Kreol Scam Corpus Review")
    st.caption(f"Reviewer: {reviewer}")

    col_a, col_b, col_c = st.columns([2, 2, 1])
    with col_a:
        st.subheader(row["id"])
        st.caption(f"{row['scam_type']} · {row['language_mix']}")
    with col_b:
        st.caption(f"status: {row['status']}  \nprovenance: {row['provenance']}")
    with col_c:
        st.metric("Your review", current_decision or "UNREVIEWED")

    prev_col, pos_col, next_col = st.columns([1, 2, 1])
    with prev_col:
        if st.button("← Previous", disabled=idx == 0):
            st.session_state.current_id = filtered_ids[idx - 1]
            st.rerun()
    with pos_col:
        st.caption(f"Row {idx + 1} of {len(filtered_ids)} ({st.session_state.filter_choice})")
    with next_col:
        if st.button("Next →", disabled=idx == len(filtered_ids) - 1):
            st.session_state.current_id = filtered_ids[idx + 1]
            st.rerun()

    key_prefix = _reviewer_row_key(reviewer, row["id"])
    msg_key = f"msg_{key_prefix}"
    meaning_key = f"meaning_{key_prefix}"
    add_key = f"add_{key_prefix}"
    remove_key = f"remove_{key_prefix}"
    notes_key = f"notes_{key_prefix}"

    saved_msg = (rec.get("corrected_original_message") if rec else "") or row["original_message"]
    saved_meaning = (rec.get("corrected_english_meaning") if rec else "") or row["english_meaning"]
    saved_add = parse_pipe(rec.get("signals_to_add", "")) if rec else []
    saved_remove = parse_pipe(rec.get("signals_to_remove", "")) if rec else []
    saved_notes = rec.get("review_notes", "") if rec else ""

    st.markdown("**Original message**")
    st.text_area("Original message", value=saved_msg, key=msg_key, height=100, label_visibility="collapsed")

    st.markdown("**English meaning**")
    st.text_area("English meaning", value=saved_meaning, key=meaning_key, height=80, label_visibility="collapsed")

    current_signals = parse_pipe(row["risk_signals"])
    col_sig, col_ent = st.columns(2)
    with col_sig:
        st.markdown("**Current risk signals**")
        if current_signals:
            for s in current_signals:
                st.write(f"- {s}")
        else:
            st.caption("(none -- legitimate/control row)")
    with col_ent:
        st.markdown("**Entities**")
        entities = parse_entities(row["entities"])
        if entities:
            for k, v in entities.items():
                st.write(f"- {k}: {v}")
        else:
            st.caption("{}")

    addable = sorted(s for s in VALID_RISK_SIGNALS if s not in current_signals)
    st.multiselect("Signals to add", addable, default=saved_add, key=add_key)
    st.multiselect("Signals to remove", current_signals, default=saved_remove, key=remove_key)
    st.text_area("Notes", value=saved_notes, key=notes_key, height=80)

    if row.get("notes"):
        st.caption(f"Corpus notes: {row['notes']}")

    with st.expander("Review checklist (guidance only, not required)"):
        for i, q in enumerate(REVIEW_CHECKLIST, start=1):
            st.write(f"{i}. {q}")

    st.divider()

    def _save(decision: str) -> None:
        typed_msg = st.session_state[msg_key].strip()
        typed_meaning = st.session_state[meaning_key].strip()
        record = {
            "id": row["id"],
            "reviewer": reviewer,
            "decision": decision,
            "corrected_original_message": "" if typed_msg == row["original_message"].strip() else typed_msg,
            "corrected_english_meaning": "" if typed_meaning == row["english_meaning"].strip() else typed_meaning,
            "signals_to_add": join_pipe(st.session_state[add_key]),
            "signals_to_remove": join_pipe(st.session_state[remove_key]),
            "review_notes": st.session_state[notes_key].strip(),
            "reviewed_at": now_iso(),
        }
        save_review_record(record)
        st.toast(f"Saved {decision} for {row['id']}")
        if idx < len(filtered_ids) - 1:
            st.session_state.current_id = filtered_ids[idx + 1]

    approve_col, edit_col, reject_col = st.columns(3)
    with approve_col:
        if st.button("Approve", type="primary", use_container_width=True):
            _save("APPROVE")
            st.rerun()
    with edit_col:
        if st.button("Save Edit", use_container_width=True):
            _save("EDIT")
            st.rerun()
    with reject_col:
        if st.button("Reject", use_container_width=True):
            _save("REJECT")
            st.rerun()


def _render_reviewer_block(rec: dict[str, str]) -> None:
    st.write(f"Decision: {rec.get('decision', '')}")
    if rec.get("corrected_original_message"):
        st.write(f"Corrected message: {rec['corrected_original_message']}")
    if rec.get("corrected_english_meaning"):
        st.write(f"Corrected English meaning: {rec['corrected_english_meaning']}")
    if rec.get("signals_to_add"):
        st.write(f"Signals added: {rec['signals_to_add']}")
    if rec.get("signals_to_remove"):
        st.write(f"Signals removed: {rec['signals_to_remove']}")
    if rec.get("review_notes"):
        st.write(f"Notes: {rec['review_notes']}")
    if rec.get("reviewed_at"):
        st.caption(f"Reviewed at: {rec['reviewed_at']}")


def _render_match_indicator(label: str, joshua: dict[str, str], caellum: dict[str, str], field: str) -> None:
    j_val = joshua.get(field, "")
    c_val = caellum.get(field, "")
    if j_val == c_val:
        st.caption(f"{label}: corrections match")
    else:
        st.caption(f"{label}: corrections differ -- reconciliation required")


def _render_comparison_tab(corpus_rows: list[dict[str, str]], records: dict[tuple[str, str], dict[str, str]]) -> None:
    st.title("Review Comparison")
    st.caption("Read-only. No corpus changes happen here -- disagreements need human reconciliation.")

    summary = comparison_summary(corpus_rows, records)
    row1 = st.columns(4)
    row1[0].metric("Total rows", summary["total"])
    row1[1].metric("Both reviewed", summary["both_reviewed"])
    row1[2].metric("Same decision", summary["same_decision"])
    row1[3].metric("Disagreements", summary["disagreements"])
    row2 = st.columns(3)
    row2[0].metric("Awaiting Joshua", summary["awaiting_joshua"])
    row2[1].metric("Awaiting Caellum", summary["awaiting_caellum"])
    row2[2].metric("Neither reviewed", summary["neither_reviewed"])

    filter_options = [
        "All", "Both reviewed", "Same decision", "Disagreements",
        "Waiting for Joshua", "Waiting for Caellum", "Neither reviewed",
    ]
    st.session_state.setdefault("compare_filter", "All")
    compare_filter = st.selectbox("Filter", filter_options, index=filter_options.index(st.session_state.compare_filter))
    st.session_state.compare_filter = compare_filter

    rows = filter_rows_for_comparison(corpus_rows, records, compare_filter)
    if not rows:
        st.info(f"No rows match {compare_filter!r}.")
        return

    for row in rows:
        state = comparison_state(row["id"], records)
        with st.expander(f"{row['id']} -- {state}"):
            st.write(f"**Original:** {row['original_message']}")
            joshua = records.get((row["id"], "Joshua"))
            caellum = records.get((row["id"], "Caellum"))

            if state == "BOTH_PENDING":
                st.caption("Neither reviewer has reviewed this row yet.")
                continue
            if joshua and not caellum:
                st.write("**Joshua**")
                _render_reviewer_block(joshua)
                st.caption("Awaiting Caellum.")
                continue
            if caellum and not joshua:
                st.write("**Caellum**")
                _render_reviewer_block(caellum)
                st.caption("Awaiting Joshua.")
                continue

            col_j, col_c = st.columns(2)
            with col_j:
                st.write("**Joshua**")
                _render_reviewer_block(joshua)
            with col_c:
                st.write("**Caellum**")
                _render_reviewer_block(caellum)

            if state == "AGREED_EDIT":
                _render_match_indicator("Corrected message", joshua, caellum, "corrected_original_message")
                _render_match_indicator("Corrected English meaning", joshua, caellum, "corrected_english_meaning")
                _render_match_indicator("Signals to add", joshua, caellum, "signals_to_add")
                _render_match_indicator("Signals to remove", joshua, caellum, "signals_to_remove")


def main() -> None:
    st.set_page_config(page_title="Kreol Scam Corpus Review", layout="wide")

    corpus_rows = load_corpus_rows()
    records = load_review_records()
    all_ids = [r["id"] for r in corpus_rows]

    st.session_state.setdefault("reviewer", "")
    st.session_state.setdefault("filter_choice", "All")
    st.session_state.setdefault("current_id", all_ids[0])

    with st.sidebar:
        st.header("Reviewer")
        options = ["-- select --", *REVIEWERS]
        current_index = options.index(st.session_state.reviewer) if st.session_state.reviewer in REVIEWERS else 0
        selected = st.selectbox("Select reviewer identity", options, index=current_index)
        st.session_state.reviewer = "" if selected == "-- select --" else selected

        if st.session_state.reviewer:
            progress = reviewer_progress(st.session_state.reviewer, corpus_rows, records)
            st.caption(f"Reviewer: {st.session_state.reviewer}")
            st.progress(progress["reviewed"] / progress["total"] if progress["total"] else 0)
            st.write(
                f"Reviewed: {progress['reviewed']} / {progress['total']}  \n"
                f"Approved: {progress['APPROVE']} · Edited: {progress['EDIT']} · "
                f"Rejected: {progress['REJECT']} · Remaining: {progress['remaining']}"
            )

            st.divider()
            st.subheader("Filter")
            filter_options = ["All", "Unreviewed by me", *DECISIONS]
            filter_index = filter_options.index(st.session_state.filter_choice)
            st.session_state.filter_choice = st.selectbox("Show", filter_options, index=filter_index)

            st.divider()
            st.subheader("Jump to ID")
            jump_id = st.selectbox("Corpus ID", all_ids, index=all_ids.index(st.session_state.current_id))
            if jump_id != st.session_state.current_id:
                st.session_state.current_id = jump_id
                st.session_state.filter_choice = "All"
                st.rerun()

    if not st.session_state.reviewer:
        st.title("Kreol Scam Corpus Review")
        st.info("Select your reviewer identity (Joshua or Caellum) in the sidebar to begin.")
        return

    tab_review, tab_compare = st.tabs(["Review", "Review Comparison"])
    with tab_review:
        _render_review_tab(corpus_rows, records, st.session_state.reviewer)
    with tab_compare:
        _render_comparison_tab(corpus_rows, records)


if __name__ == "__main__":
    main()

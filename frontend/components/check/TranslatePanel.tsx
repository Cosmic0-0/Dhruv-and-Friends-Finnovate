"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { translateMessage } from "@/lib/api";
import type { StoredResult } from "@/lib/storage";
import { restoreTokens, tokenizeRedactions } from "@/lib/translate";
import type { TranslateLanguage, TranslateResponse } from "@/lib/types";
import { chipStyle } from "../dc";
import type { CheckCopy } from "./content";

/** Mirrors the backend's MAX_TRANSLATE_LENGTH; a longer message is not offered a partial translation. */
const MAX_TRANSLATE_LENGTH = 2000;
const TARGETS: readonly TranslateLanguage[] = ["mfe", "en", "fr"];

type Outcome = { kind: "text"; text: string } | { kind: "note"; key: "same" | "undetermined" | "unsupported" | "rejected" | "unavailable" | "failed" };

function outcomeFor(data: TranslateResponse, restore: (s: string) => string): Outcome {
  if (data.status === "ok" && data.text) return { kind: "text", text: restore(data.text) };
  if (data.status === "same_language") return { kind: "note", key: "same" };
  return { kind: "note", key: data.status === "ok" ? "failed" : data.status };
}

/**
 * "Translate this message" on the result: on demand only, never automatic, and
 * apart from the verdict. It sends the redacted message (redaction placeholders
 * swapped for opaque tokens) to POST /api/translate and shows the answer as plain
 * text under an always-visible "machine translation, not reviewed" label. The
 * evidence highlights above still come from the original message.
 */
export default function TranslatePanel({ result, t }: { result: StoredResult; t: CheckCopy }) {
  const copy = t.result.translate;
  const tokenized = useMemo(() => tokenizeRedactions(result.redacted, result.redactions), [result.redacted, result.redactions]);
  const [target, setTarget] = useState<TranslateLanguage | null>(null);
  const [busy, setBusy] = useState(false);
  const [outcomes, setOutcomes] = useState<Partial<Record<TranslateLanguage, Outcome>>>({});
  const controller = useRef<AbortController | null>(null);

  // A new result (or leaving the screen) drops any in-flight request and old answers.
  useEffect(() => {
    setTarget(null);
    setOutcomes({});
    setBusy(false);
    return () => controller.current?.abort();
  }, [result.redacted]);

  if (tokenized.text.trim() === "" || tokenized.text.length > MAX_TRANSLATE_LENGTH) return null;

  async function pick(next: TranslateLanguage) {
    controller.current?.abort();
    setTarget(next);
    if (outcomes[next]) return;
    const ctl = new AbortController();
    controller.current = ctl;
    setBusy(true);
    const res = await translateMessage({ message: tokenized.text, target: next }, { signal: ctl.signal });
    if (ctl.signal.aborted) return;
    const outcome: Outcome = res.ok ? outcomeFor(res.data, (s) => restoreTokens(s, tokenized.tokens)) : { kind: "note", key: "failed" };
    setOutcomes((prev) => ({ ...prev, [next]: outcome }));
    setBusy(false);
  }

  const shown = target ? outcomes[target] : undefined;

  return (
    <section style={{ margin: "0 40px", borderTop: "1px solid var(--dc-line2)", padding: "24px 0", display: "flex", flexDirection: "column", gap: 12 }}>
      <span style={{ fontSize: 13, color: "var(--dc-text3)" }}>{copy.title}</span>
      <div role="group" aria-label={copy.title} style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {TARGETS.map((code) => (
          <button key={code} type="button" aria-pressed={target === code} disabled={busy && target !== code} onClick={() => void pick(code)} style={chipStyle(target === code, 40)}>
            {copy.to[code]}
          </button>
        ))}
        {target && (
          <button
            type="button"
            onClick={() => {
              controller.current?.abort();
              setTarget(null);
              setBusy(false);
            }}
            style={{ background: "none", border: 0, cursor: "pointer", fontSize: 14, color: "var(--dc-text2)", textDecoration: "underline", textUnderlineOffset: 3 }}
          >
            {copy.hide}
          </button>
        )}
      </div>

      {target && (
        <div aria-live="polite" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {busy && !shown && <p style={{ margin: 0, fontSize: 15, color: "var(--dc-text3)" }}>{copy.working}</p>}
          {shown?.kind === "text" && (
            <>
              <p style={{ margin: 0, fontSize: 18, lineHeight: 1.7, color: "var(--dc-text-body)", whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{shown.text}</p>
              <p style={{ margin: 0, fontSize: 13, color: "var(--dc-text3)" }}>{copy.note}</p>
            </>
          )}
          {shown?.kind === "note" && <p style={{ margin: 0, fontSize: 15, color: "var(--dc-text2)" }}>{copy[shown.key]}</p>}
        </div>
      )}
    </section>
  );
}

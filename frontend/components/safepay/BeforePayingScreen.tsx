"use client";

import { useRef, useState, type CSSProperties } from "react";
import { card, chipStyle, DcPage, IdlePanel, Mark, PageHeader, Pill, Seg, WhatToDoPanel, type Tone } from "@/components/dc";
import { dcCopy } from "@/components/dc/content";
import { useLanguage } from "@/components/LanguageProvider";
import { checkPayee, type ApiError } from "@/lib/api";
import { useWaitStage, WaitFill } from "@/components/WaitProgress";
import type { CheckPayeeResponse, PayeeFinding, PayeeMethod, PayeePurpose } from "@/lib/types";
import { content } from "./content";

/**
 * "Before paying" (Before Paying.dc.html). The form maps 1:1 onto
 * POST /api/check-payee (backend/src/services/payee-check): a deterministic,
 * read-only lookup (report count, format validity, organisation-on-personal-
 * number, large-amount) that never claims to know who owns the account - see
 * CLAUDE.md and the caveat rendered with every result.
 */

const METHODS: { id: PayeeMethod; key: "phone" | "bank_account" | "iban" }[] = [
  { id: "phone", key: "phone" },
  { id: "bank_account", key: "bank_account" },
  { id: "iban", key: "iban" },
];
const PURPOSES: PayeePurpose[] = ["car", "rent_deposit", "online_shop", "family", "invoice"];

type Status = "idle" | "loading" | "error" | "done";

const fieldLabel: CSSProperties = { fontSize: 13, color: "var(--dc-text3)" };
const inputStyle: CSSProperties = {
  height: 48,
  padding: "0 16px",
  borderRadius: 14,
  border: "1px solid var(--dc-line)",
  background: "var(--dc-bg)",
  color: "var(--dc-ink)",
  fontSize: 15,
  fontFamily: "inherit",
  width: "100%",
};

function Field({
  label,
  ...props
}: { label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <span style={fieldLabel}>{label}</span>
      <input {...props} style={inputStyle} />
    </label>
  );
}

function toneOf(severity: PayeeFinding["severity"]): Tone {
  return severity === "red" ? "red" : severity === "amber" ? "amber" : "green";
}
function glyphOf(severity: PayeeFinding["severity"]): string {
  return severity === "red" ? "✕" : severity === "amber" ? "!" : "✓";
}

function findingText(f: PayeeFinding, t: ReturnType<typeof content>): string {
  const template = (t.findings as Record<string, string>)[f.code] ?? f.code;
  return template
    .replace("{count}", String(f.params?.count ?? ""))
    .replace("{country}", f.params?.country ?? "")
    .replace("{organisation}", f.params?.organisation ?? "")
    .replace("{amount}", typeof f.params?.amount === "number" ? f.params.amount.toLocaleString("en-US") : "");
}

export default function BeforePayingScreen() {
  const { lang, copy } = useLanguage();
  const t = content(lang);
  const nav = dcCopy(lang);

  const [method, setMethod] = useState<PayeeMethod>("phone");
  const [identifier, setIdentifier] = useState("");
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [purpose, setPurpose] = useState<PayeePurpose | undefined>(undefined);

  const [status, setStatus] = useState<Status>("idle");
  const [formError, setFormError] = useState<string | null>(null);
  const [apiError, setApiError] = useState<ApiError | null>(null);
  const [result, setResult] = useState<CheckPayeeResponse | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const loading = status === "loading";
  const stage = useWaitStage(loading);

  async function submit() {
    const id = identifier.trim();
    if (!id) {
      setFormError(t.missingIdentifier);
      return;
    }
    let amt: number | undefined;
    if (amount.trim()) {
      amt = Number(amount.replace(/[^\d.]/g, ""));
      if (!Number.isFinite(amt)) {
        setFormError(t.invalidAmount);
        return;
      }
    }
    setFormError(null);
    setApiError(null);
    setStatus("loading");
    const controller = new AbortController();
    abortRef.current = controller;

    const res = await checkPayee(
      { method, identifier: id, name: name.trim() || undefined, amount: amt, purpose },
      { signal: controller.signal },
    );
    if (controller.signal.aborted) return;
    if (!res.ok) {
      if (res.error.kind === "aborted") return;
      setApiError(res.error);
      setStatus("error");
      return;
    }
    setResult(res.data);
    setStatus("done");
  }

  function cancel() {
    abortRef.current?.abort();
    abortRef.current = null;
    setStatus("idle");
  }

  function checkAnother() {
    setIdentifier("");
    setName("");
    setAmount("");
    setPurpose(undefined);
    setResult(null);
    setApiError(null);
    setFormError(null);
    setStatus("idle");
  }

  const verdictTone: Tone | null = result ? (result.verdict === "stop" ? "red" : result.verdict === "caution" ? "amber" : "green") : null;
  const verdictGlyph = result ? (result.verdict === "stop" ? "✕" : result.verdict === "caution" ? "!" : "✓") : "";

  return (
    <DcPage label="Before paying">
      <PageHeader eyebrow={t.eyebrow} title={t.title} lede={t.lede} />

      <div className="dc-split" style={{ display: "grid", gridTemplateColumns: "minmax(0,0.85fr) minmax(0,1.15fr)", gap: 20, alignItems: "start" }}>
        <section
          className="dc-sticky dc-panel"
          aria-label={t.formLabel}
          style={{ ...card(32), position: "sticky", top: 24, padding: 32, display: "flex", flexDirection: "column", gap: 22 }}
        >
          <span style={{ fontSize: 13, color: "var(--dc-text3)" }}>{t.formLabel}</span>

          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <span style={fieldLabel}>{t.methodLabel}</span>
            <Seg options={METHODS.map((m) => ({ id: m.id, label: t.methods[m.key] }))} value={method} onChange={setMethod} label={t.methodLabel} />
          </div>

          <Field
            label={t.identifierLabel[method]}
            value={identifier}
            onChange={(e) => { setIdentifier(e.target.value); if (formError) setFormError(null); }}
            placeholder={t.identifierPlaceholder[method]}
            maxLength={64}
          />
          <Field label={t.nameLabel} value={name} onChange={(e) => setName(e.target.value)} placeholder={t.namePlaceholder} maxLength={100} />
          <Field
            label={t.amountLabel}
            value={amount}
            onChange={(e) => { setAmount(e.target.value); if (formError) setFormError(null); }}
            placeholder={t.amountPlaceholder}
            inputMode="decimal"
          />

          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <span style={fieldLabel}>{t.reasonLabel}</span>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {PURPOSES.map((p) => (
                <button key={p} type="button" style={chipStyle(purpose === p)} onClick={() => setPurpose(purpose === p ? undefined : p)}>
                  {t.reasons[p]}
                </button>
              ))}
            </div>
          </div>

          {formError && <p role="alert" style={{ margin: 0, fontSize: 13, color: "var(--dc-red)" }}>{formError}</p>}

          <Pill variant="ink" height={56} onClick={() => void submit()} disabled={loading} style={{ width: "100%" }}>
            {loading ? t.checking : t.submit}
          </Pill>
          {loading && (
            <button type="button" onClick={cancel} style={{ alignSelf: "center", background: "none", border: "none", color: "var(--dc-text3)", fontSize: 13, cursor: "pointer" }}>
              {t.cancel}
            </button>
          )}
        </section>

        <section aria-live="polite" style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          {status === "idle" && !result && <IdlePanel title={t.idleTitle} body={t.idleBody} />}

          {loading && (
            <div style={{ ...card(32), padding: 36, minHeight: 300, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 14 }}>
              <span className="dc-mono" style={{ fontSize: 13, color: "var(--dc-text3)" }}>{t.checking}</span>
              <div style={{ position: "relative", width: "100%", maxWidth: 220, height: 4, borderRadius: 999, overflow: "hidden", background: "var(--dc-line)" }}>
                <WaitFill phase="running" stage={stage} className="bg-[var(--dc-ink)]" />
              </div>
            </div>
          )}

          {status === "error" && apiError && (
            <div role="alert" style={{ ...card(32), padding: 32, display: "flex", flexDirection: "column", gap: 14 }}>
              <span style={{ fontSize: 15, color: "var(--dc-text2)" }}>{apiError.message}</span>
              <Pill variant="outline" onClick={() => void submit()} style={{ alignSelf: "flex-start" }}>
                {copy.retry}
              </Pill>
            </div>
          )}

          {result && verdictTone && (
            <>
              <div style={{ ...card(32), padding: 32, display: "flex", flexDirection: "column", gap: 24 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
                  <Mark tone={verdictTone} glyph={verdictGlyph} size={64} />
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <span style={{ fontSize: 13, color: "var(--dc-text3)" }}>{nav.common.verdict}</span>
                    <span style={{ fontSize: 28, fontWeight: 600, letterSpacing: "-0.04em", lineHeight: 1.15 }}>{t.verdict[result.verdict]}</span>
                  </div>
                </div>
                <span style={{ fontSize: 15, lineHeight: 1.55, color: "var(--dc-text2)" }}>{t.verdictBody[result.verdict]}</span>

                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  <span style={{ fontSize: 13, color: "var(--dc-text3)" }}>{t.findingsTitle}</span>
                  {result.findings.map((f, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                      <Mark tone={toneOf(f.severity)} glyph={glyphOf(f.severity)} size={36} />
                      <span style={{ fontSize: 15, lineHeight: 1.5, color: "var(--dc-ink)", paddingTop: 6 }}>{findingText(f, t)}</span>
                    </div>
                  ))}
                </div>

                <span style={{ fontSize: 13, lineHeight: 1.5, color: "var(--dc-text4)" }}>{t.caveat}</span>
              </div>

              <WhatToDoPanel label={nav.common.whatToDo} headline={t.whatToDo[result.verdict]} body={t.whatToDoBody[result.verdict]}>
                <Pill variant="light" onClick={checkAnother}>{t.checkAnother}</Pill>
              </WhatToDoPanel>
            </>
          )}
        </section>
      </div>
    </DcPage>
  );
}

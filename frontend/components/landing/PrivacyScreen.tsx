"use client";

import { card, DcPage, PageHeader, Pill } from "@/components/dc";
import { useLanguage } from "@/components/LanguageProvider";
import { REPO_URL } from "@/lib/team";
import { content } from "./content";

/**
 * Plain-language privacy summary for the web app. Every statement mirrors
 * documented behaviour: client-side redaction (lib/redact.ts), server-side
 * OCR redaction, community reports stored as fingerprints and purged after
 * 90 days (public/link-guard-privacy.html §5), and on-device history.
 */
export default function PrivacyScreen() {
  const { lang } = useLanguage();
  const t = content(lang).privacyPage;
  return (
    <DcPage label="Privacy" maxWidth={880} gap={40}>
      <PageHeader eyebrow={t.eyebrow} title={t.title} lede={t.lede} />
      <section data-fx className="dc-panel" style={{ ...card(28), padding: "4px 28px" }}>
        {t.sections.map((sec, i) => (
          <div key={sec.title} style={{ display: "flex", flexDirection: "column", gap: 6, padding: "22px 0", borderTop: i ? "1px solid var(--dc-line2)" : "none" }}>
            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 500 }}>{sec.title}</h2>
            <p style={{ margin: 0, fontSize: 15, lineHeight: 1.55, color: "var(--dc-text2)" }}>{sec.body}</p>
          </div>
        ))}
      </section>
      <a href="/link-guard-privacy.html" className="dc-link" style={{ fontSize: 15, fontWeight: 500 }}>{t.extensionPolicy} →</a>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
        <span style={{ fontSize: 15, color: "var(--dc-text3)" }}>{t.contact}</span>
        <Pill href={`${REPO_URL}/issues`} variant="outline" height={48}>{t.contactCta}</Pill>
      </div>
    </DcPage>
  );
}

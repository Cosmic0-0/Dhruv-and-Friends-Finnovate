"use client";

import { card, DcPage, PageHeader, Pill } from "@/components/dc";
import { useLanguage } from "@/components/LanguageProvider";
import { REPO_URL } from "@/lib/team";
import { content } from "./content";

/**
 * Install page for the Link Guard extension (extension/ in the repo), in the
 * design language. There is no store listing, so installation is from source:
 * the zip is GitHub's own archive of the public repository.
 */
const ZIP_URL = `${REPO_URL}/archive/refs/heads/main.zip`;
const SOURCE_URL = `${REPO_URL}/tree/main/extension`;

export default function ExtensionScreen() {
  const { lang } = useLanguage();
  const t = content(lang).extensionPage;
  const edge = t.chromeTitle;

  return (
    <DcPage label="Extension" gap={48}>
      <PageHeader eyebrow={t.eyebrow} title={t.title} lede={t.lede} />

      <div className="dc-split" style={{ display: "grid", gridTemplateColumns: "minmax(0,1.2fr) minmax(0,1fr)", gap: 20, alignItems: "start" }}>
        <section id="chrome" data-fx className="dc-panel" style={{ ...card(32, true), padding: 36, display: "flex", flexDirection: "column", gap: 28, scrollMarginTop: 92 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <h2 style={{ margin: 0, fontSize: 32, fontWeight: 600, letterSpacing: "-0.04em", lineHeight: 1.1 }}>{edge}</h2>
            <span style={{ fontSize: 15, color: "var(--dc-text3)" }}>{t.chromeNote}</span>
          </div>
          <ol style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column" }}>
            {t.steps.map((step, i) => (
              <li key={i} style={{ display: "grid", gridTemplateColumns: "44px minmax(0,1fr)", gap: 18, alignItems: "center", padding: "18px 0", borderTop: "1px solid var(--dc-line2)" }}>
                <span className="dc-mono" style={{ width: 44, height: 44, borderRadius: 15, background: "var(--dc-hover)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13 }}>
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span style={{ fontSize: 16, lineHeight: 1.5 }}>{step}</span>
              </li>
            ))}
          </ol>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <Pill href={ZIP_URL} height={48}>{t.download}</Pill>
            <Pill href={SOURCE_URL} variant="outline" height={48}>{t.viewSource}</Pill>
          </div>
        </section>

        <div className="dc-sticky" style={{ display: "flex", flexDirection: "column", gap: 20, position: "sticky", top: 92 }}>
          <section id="other-browsers" data-fx style={{ ...card(32), padding: 32, display: "flex", flexDirection: "column", gap: 16, scrollMarginTop: 92 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
              <span style={{ fontSize: 17, fontWeight: 600, letterSpacing: "-0.02em" }}>Microsoft Edge</span>
              <a href="#chrome" className="dc-link" style={{ fontSize: 14, fontWeight: 500, whiteSpace: "nowrap" }}>{edge} ↑</a>
            </div>
            <span style={{ fontSize: 15, lineHeight: 1.55, color: "var(--dc-text2)", marginTop: -8, paddingBottom: 14, borderBottom: "1px solid var(--dc-line2)" }}>{t.edgeBody}</span>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
              <span style={{ fontSize: 17, fontWeight: 600, letterSpacing: "-0.02em" }}>{t.firefoxTitle}</span>
              <span style={{ fontSize: 12, fontWeight: 500, padding: "5px 10px", borderRadius: 999, background: "var(--dc-amber-hl)", color: "var(--dc-amber)", whiteSpace: "nowrap" }}>{t.notSupported}</span>
            </div>
            <span style={{ fontSize: 15, lineHeight: 1.55, color: "var(--dc-text2)" }}>{t.firefoxBody}</span>
          </section>

          <section data-fx style={{ ...card(32), padding: 32, display: "flex", flexDirection: "column", gap: 8 }}>
            <span style={{ fontSize: 22, fontWeight: 600, letterSpacing: "-0.03em", paddingBottom: 8 }}>{t.whatTitle}</span>
            {t.what.map((w, i) => (
              <div key={i} style={{ display: "grid", gridTemplateColumns: "28px minmax(0,1fr)", gap: 12, padding: "14px 0", borderTop: "1px solid var(--dc-line2)" }}>
                <span className="dc-mono" style={{ fontSize: 12, color: "var(--dc-text3)", paddingTop: 3 }}>{String(i + 1).padStart(2, "0")}</span>
                <span style={{ fontSize: 15, lineHeight: 1.5 }}>{w}</span>
              </div>
            ))}
            <a href="/link-guard-privacy.html" className="dc-link" style={{ fontSize: 14, fontWeight: 500, paddingTop: 10 }}>{t.privacy} →</a>
          </section>
        </div>
      </div>
    </DcPage>
  );
}

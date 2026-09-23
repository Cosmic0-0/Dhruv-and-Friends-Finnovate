"use client";

import { card, DcPage, PageHeader, Pill } from "@/components/dc";
import { useLanguage } from "@/components/LanguageProvider";
import { REPO_URL, TEAM } from "@/lib/team";
import { content } from "./content";
import s from "./created-by.module.css";

/**
 * Created By.dc.html. Names, photos and profile links come from lib/team.ts;
 * a profile button is shown only when that link really exists (no LinkedIn
 * URLs are on record, so none are shown).
 */
const ORDER = ["dhruv", "caellum", "joshua", "oleg"] as const;
const POSITION: Record<(typeof ORDER)[number], string> = { dhruv: "50% 30%", caellum: "50% 55%", joshua: "50% 70%", oleg: "50% 40%" };

export default function CreatedByScreen() {
  const { lang } = useLanguage();
  const t = content(lang);
  const devs = ORDER.map((id) => TEAM.find((m) => m.id === id)).filter((m) => m !== undefined);

  return (
    <DcPage label="Created by" gap={56}>
      <PageHeader
        eyebrow={t.eyebrow}
        title={t.title}
        titleSize={72}
        lede={<span style={{ display: "block", maxWidth: 520 }}>{t.lede}</span>}
        aside={
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src="/brand/dhruv-and-friends.png"
            alt={t.badgeAlt}
            className={s.badge}
            style={{ width: 132, height: 132, borderRadius: "50%", background: "#FFFFFF", padding: 6, display: "block", boxShadow: "var(--dc-shadow-lg)" }}
          />
        }
      />

      <figure data-fx className={s.group} style={{ margin: 0, borderRadius: 40, overflow: "hidden", border: "1px solid var(--dc-line)", background: "var(--dc-surface)", boxShadow: "var(--dc-shadow-lg)", position: "relative" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/group_photo.jpeg" alt={t.groupAlt} className={s.groupImg} style={{ width: "100%", aspectRatio: "21/10", objectFit: "cover", objectPosition: "50% 38%", display: "block" }} />
        <figcaption className={s.figcaption} style={{ position: "absolute", left: 24, bottom: 24, display: "flex", alignItems: "center", gap: 10, padding: "10px 16px", borderRadius: 999, background: "rgba(0,0,0,0.55)", backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)", color: "#FFFFFF", fontSize: 14, whiteSpace: "nowrap" }}>
          <span aria-hidden="true" style={{ width: 6, height: 6, borderRadius: "50%", background: "#12B76A" }} />
          {t.caption}
        </figcaption>
      </figure>

      <section style={{ display: "flex", flexDirection: "column", gap: 24 }}>
        <h2 style={{ margin: 0, fontSize: 36, fontWeight: 600, letterSpacing: "-0.04em" }}>{t.team}</h2>
        <div className={s.team} style={{ display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))", gap: 20 }}>
          {devs.map((d) => {
            const first = d.name.split(" ")[0];
            const links = [
              { label: t.github, href: d.github },
              ...(d.linkedin ? [{ label: t.linkedin, href: d.linkedin }] : []),
            ];
            return (
              <article key={d.id} data-fx style={{ ...card(32), padding: 12, display: "flex", flexDirection: "column", gap: 18 }}>
                <div style={{ borderRadius: 24, overflow: "hidden", aspectRatio: "4/5", background: "var(--dc-hover)" }}>
                  {d.photo && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={d.photo} alt={d.name} loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: POSITION[d.id as (typeof ORDER)[number]], display: "block" }} />
                  )}
                </div>
                <div style={{ padding: "0 12px", display: "flex", flexDirection: "column", gap: 4 }}>
                  <span style={{ fontSize: 24, fontWeight: 600, letterSpacing: "-0.035em" }}>{first}</span>
                  <span style={{ fontSize: 14, color: "var(--dc-text3)" }}>{t.roles[d.id as keyof typeof t.roles]}</span>
                </div>
                <div style={{ padding: "0 12px 12px", display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {links.map((l) => (
                    <a key={l.label} href={l.href} target="_blank" rel="noopener noreferrer" className="dc-pill dc-link" style={{ height: 38, padding: "0 14px", borderRadius: 999, border: "1px solid var(--dc-line-strong)", fontSize: 13, display: "flex", alignItems: "center", gap: 6, whiteSpace: "nowrap" }}>
                      {l.label}
                      <span aria-hidden="true" style={{ color: "var(--dc-text4)" }}>↗</span>
                    </a>
                  ))}
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <figure className={s.pair} style={{ margin: 0, display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1.2fr)", gap: 20, alignItems: "stretch" }}>
        <div data-fx style={{ borderRadius: 32, overflow: "hidden", border: "1px solid var(--dc-line)" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/dhruv%26oleg_chinese.jpeg" alt={t.pairAlt} loading="lazy" className={s.pairPhoto} style={{ width: "100%", height: "100%", minHeight: 420, objectFit: "cover", display: "block" }} />
        </div>
        <figcaption data-fx className={s.caption} style={{ ...card(32), padding: 40, display: "flex", flexDirection: "column", justifyContent: "flex-end", gap: 14 }}>
          <span style={{ fontSize: 13, color: "var(--dc-text3)" }}>{t.offDuty}</span>
          <span style={{ fontSize: 36, fontWeight: 600, letterSpacing: "-0.04em", lineHeight: 1.05 }}>{t.pair}</span>
          <Pill href={`${REPO_URL}/issues`} height={48} style={{ alignSelf: "flex-start", marginTop: 12 }}>{t.contact}</Pill>
        </figcaption>
      </figure>
    </DcPage>
  );
}

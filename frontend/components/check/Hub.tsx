"use client";

import { useState } from "react";
import Link from "next/link";
import { ChatArt, DocArt, PayArt } from "../landing/Art";
import type { CheckCopy } from "./content";
import s from "./Hub.module.css";

const FEATURED = ["/safepay", "/document", "/conversation"];
const ART: Record<string, () => React.JSX.Element> = { "/safepay": PayArt, "/document": DocArt, "/conversation": ChatArt };

/**
 * The Check hub: headline, the message box (a real check; with nothing typed
 * the real MCB example is the main action, so a demo is one click), the three
 * other checks (payee, document, whole conversation), then the rest as a row.
 */
export default function Hub({
  t,
  onStart,
}: {
  t: CheckCopy;
  /** Switch to the workspace. `autoSubmit` fires a real check immediately; otherwise the text just prefills. */
  onStart: (text: string, autoSubmit?: boolean) => void;
}) {
  const [text, setText] = useState("");
  const hasText = Boolean(text.trim());
  const go = () => hasText && onStart(text, true);

  const featured = t.hub.tools.filter((tool) => FEATURED.includes(tool.href));
  const rest = t.hub.tools.filter((tool) => !FEATURED.includes(tool.href));

  return (
    <div data-screen-label="Check hub" className={s.hub}>
      <div>
        <h1 className={`dc-h1 ${s.title}`}>
          {t.hub.titleA}
          <span className={s.titleAccent}>{t.hub.titleB}</span>
        </h1>
        <p className={s.lede}>{t.hub.lede}</p>
      </div>

      <div data-fx className={s.box}>
        <div className={s.boxHead}>
          <span className={s.boxTitle}>{t.hub.cardTitle}</span>
          <span className={s.eyebrow}>{t.hub.eyebrow}</span>
        </div>
        <textarea
          className={s.textarea}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) go();
          }}
          placeholder={t.work.placeholder}
          aria-label={t.work.placeholder}
          rows={4}
        />
        <div className={s.boxFoot}>
          <div className={s.actions}>
            {hasText ? (
              <button type="button" className={`${s.btn} ${s.btnHot}`} onClick={go}>{t.work.check}</button>
            ) : (
              <button type="button" className={`${s.btn} ${s.btnHot}`} onClick={() => onStart(t.example, true)}>{t.hub.tryExample} →</button>
            )}
          </div>
          <span className={s.engine}>
            <span className={s.engineDot} aria-hidden="true" />
            {t.hub.engineNote}
          </span>
        </div>
        <span className={s.note}>{t.work.privacy}</span>
      </div>

      <section aria-label={t.hub.toolsTitle}>
        <div className={s.toolsHead}>
          <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>{t.hub.toolsTitle}</h2>
        </div>
        <div className={s.grid}>
          {featured.map((tool) => {
            const Art = ART[tool.href];
            return (
              <Link key={tool.href} href={tool.href} data-fx className={s.cell}>
                <span>
                  <span className={s.cellN}>{tool.n}</span>
                  <span className={s.cellTitle}>{tool.title}</span>
                  <span className={s.cellBody}>{tool.body}</span>
                  <span className={s.cellLooks}>{tool.looks}</span>
                  <span className={s.cellOpen}>{t.hub.open}</span>
                </span>
                <span className={s.art} aria-hidden="true">{Art && <Art />}</span>
              </Link>
            );
          })}
        </div>
        <div className={s.more}>
          <span className={s.eyebrow} style={{ marginRight: 6 }}>{t.hub.moreTitle}</span>
          {rest.map((tool) => (
            <Link key={tool.href} href={tool.href} className={s.moreLink}>{tool.title}</Link>
          ))}
          {t.hub.extraLinks.map((l) => (
            <Link key={l.href} href={l.href} className={s.moreLink}>{l.title}</Link>
          ))}
        </div>
      </section>
    </div>
  );
}

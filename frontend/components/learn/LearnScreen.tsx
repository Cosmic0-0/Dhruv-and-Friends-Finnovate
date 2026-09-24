"use client";

import { useEffect, useRef, useState } from "react";
import { DcPage, PageHeader, Pill, card, pillStyle, TONE, MONO } from "@/components/dc";
import {
  buildRound,
  languagePool,
  localDay,
  type LanguagePool,
  type QuizItem,
  type QuizLanguage,
  type TrendCard,
} from "@/lib/learn-content";
import { redact } from "@/lib/redact";
import { safeChecks } from "@/lib/result";
import { DAILY_GOAL, recordAnswer, visibleStreak, weekHistory, type Mistake, type StreakState } from "@/lib/streak";
import { getStreakState, resetStreakState, saveStreakState, seedStreakEndingYesterday } from "@/lib/storage";
import type { Copy, UiLanguage } from "@/lib/i18n";
import { useLanguage } from "../LanguageProvider";
import { CheckIcon } from "../icons";
import Celebration from "./Celebration";
import StreakCards from "./StreakCards";
import { learnCopy, fill, type LearnCopy } from "./content";
import styles from "./AnswerButtons.module.css";

type CelebrationData = { streak: number; right: number; total: number; mistakes: Mistake[] };

const SCAM_TYPE_LABEL: Record<string, string> = {
  account_verification: "Account verification",
  bank_impersonation: "Bank impersonation",
  family_impersonation: "Family impersonation",
  government_impersonation: "Government impersonation",
  investment: "Investment offer",
  job_scam: "Job offer",
  merchant_payment_change: "Payment details change",
  otp_theft: "OTP request",
  parcel_customs: "Parcel & customs fee",
  payment_request: "Payment request",
  prize_lottery: "Prize / lottery",
  refund_scam: "Refund offer",
};

/** A label derived from the item's own scam_type (or "genuine") — never a fabricated sender name, number or handle. */
function senderLabel(item: QuizItem, genuineLabel: string): string {
  if (!item.isScam) return genuineLabel;
  return SCAM_TYPE_LABEL[item.scamType] ?? item.scamType.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Learn tab, styled to Learn.dc.html: header with title + 3 stat tiles,
 * a 1.6fr/1fr split (quiz card | "This week" + "Rule of thumb"), then a
 * full-width "Common scam patterns" section. Fully client-side over
 * build-time corpus data: no API call. A round is exactly DAILY_GOAL (5)
 * questions, so the quiz card's own position counter and the daily-goal
 * bar always agree.
 */
export default function LearnScreen({ items, trends }: { items: QuizItem[]; trends: TrendCard[] }) {
  const { lang, copy, ready } = useLanguage();
  const t = learnCopy(lang);
  // null until mounted: localStorage isn't available during server render.
  const [state, setState] = useState<StreakState | null>(null);
  const [acceptedFallback, setAcceptedFallback] = useState<QuizLanguage | null>(null);
  const [celebration, setCelebration] = useState<CelebrationData | null>(null);
  const today = localDay();

  useEffect(() => setState(getStreakState()), []);
  useEffect(() => setAcceptedFallback(null), [lang]);

  const save = (next: StreakState) => {
    setState(next);
    saveStreakState(next);
  };

  const pool = languagePool(items, lang);
  const quizLang: QuizLanguage | null = pool.enough ? lang : acceptedFallback;
  const done = state ? Math.min(state.today.answered, DAILY_GOAL) : 0;

  return (
    <>
      <DcPage label="learn" gap={56}>
        <PageHeader
          eyebrow={t.eyebrow}
          title={t.title}
          lede={t.lede}
          titleSize={60}
          aside={ready && state ? <StreakCards state={state} t={t} /> : undefined}
        />

        <div className="dc-split" style={{ display: "grid", gridTemplateColumns: "minmax(0,1.6fr) minmax(0,1fr)", gap: 20, alignItems: "start" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            {!ready ? (
              <div style={{ ...card(32), minHeight: 320 }} aria-hidden="true" />
            ) : !quizLang ? (
              <LanguageNote pool={pool} t={t} copy={copy} onAccept={() => pool.fallback && setAcceptedFallback(pool.fallback)} />
            ) : (
              <>
                {quizLang !== lang && (
                  <p style={{ fontSize: 13, color: "var(--dc-text3)", width: "fit-content", background: "var(--dc-hover)", padding: "6px 10px", borderRadius: 8 }}>
                    {copy.learn.practisingIn(copy.learn.languageName[quizLang])}
                  </p>
                )}
                <Quiz
                  key={quizLang}
                  items={items}
                  quizLang={quizLang}
                  copy={copy}
                  t={t}
                  lang={lang}
                  onAnswered={(item, correct) => {
                    const { state: next, completedNow } = recordAnswer(getStreakState(today), { item, correct }, today);
                    const celebrate = completedNow && !next.today.celebrated;
                    if (celebrate) next.today = { ...next.today, celebrated: true };
                    save(next);
                    if (celebrate) {
                      setCelebration({ streak: next.streak, right: next.today.correct, total: next.today.answered, mistakes: next.today.mistakes });
                    }
                  }}
                  onFinished={(score, total) => {
                    const current = getStreakState(today);
                    const prev = current.best;
                    if (!prev || score / total > prev.score / prev.total || (score / total === prev.score / prev.total && total > prev.total)) {
                      save({ ...current, best: { score, total } });
                    }
                  }}
                  best={state?.best ?? null}
                  goalMet={done >= DAILY_GOAL}
                />
              </>
            )}
            <p style={{ padding: "0 4px", fontSize: 13, color: "var(--dc-text3)" }}>{copy.learn.syntheticNote}</p>
          </div>

          <div className="dc-sticky" style={{ display: "flex", flexDirection: "column", gap: 20, position: "sticky", top: 92 }}>
            {ready && state && <WeekCard state={state} today={today} t={t} />}
            <RuleCard t={t} />
          </div>
        </div>

        <PatternsSection trends={trends} items={items} copy={copy} t={t} />

        {process.env.NODE_ENV === "development" && (
          <DevTools
            copy={copy}
            onReset={() => {
              resetStreakState();
              setState(getStreakState());
            }}
            onSeed={() => {
              seedStreakEndingYesterday(2);
              setState(getStreakState());
            }}
          />
        )}
      </DcPage>

      {celebration && <Celebration {...celebration} copy={copy} onClose={() => setCelebration(null)} />}
    </>
  );
}

/** "This week" card (Learn.dc.html aside): 7 day squares + the daily-goal bar. */
function WeekCard({ state, today, t }: { state: StreakState; today: string; t: LearnCopy }) {
  const WD = ["S", "M", "T", "W", "T", "F", "S"];
  const week = weekHistory(state, today);
  const streak = visibleStreak(state, today);
  const done = Math.min(state.today.answered, DAILY_GOAL);
  const pct = Math.min(100, Math.round((done / DAILY_GOAL) * 100));

  return (
    <div style={{ ...card(32), padding: 28, display: "flex", flexDirection: "column", gap: 22 }} data-fx>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
        <h2 style={{ margin: 0, fontSize: 17, fontWeight: 600 }}>{t.week.title}</h2>
        <span style={{ fontSize: 13, color: "var(--dc-text3)" }}>{streak > 0 ? fill(t.week.streakLine, { n: streak }) : t.stats.noStreak}</span>
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        {week.map((d) => {
          const dow = new Date(`${d.day}T00:00:00`).getDay();
          const isToday = d.day === today;
          return (
            <div key={d.day} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, flex: 1, minWidth: 0 }}>
              <div
                aria-hidden="true"
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 12,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background: d.goalMet ? "var(--dc-accent)" : "var(--dc-hover)",
                  color: "#fff",
                  outline: isToday ? "1.5px solid var(--dc-accent)" : "none",
                  outlineOffset: isToday ? 2 : 0,
                }}
              >
                {d.goalMet && <CheckIcon className="size-4" strokeWidth={2.5} />}
              </div>
              <span style={{ fontSize: 12, color: "var(--dc-text3)" }}>{WD[dow]}</span>
            </div>
          );
        })}
      </div>
      <div style={{ borderTop: "1px solid var(--dc-line2)", paddingTop: 16, display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
          <span style={{ fontSize: 14, color: "var(--dc-text2)" }}>{t.week.dailyGoal}</span>
          <span style={{ fontSize: 14, fontWeight: 500 }}>{done}/{DAILY_GOAL}</span>
        </div>
        <div style={{ height: 8, borderRadius: 4, background: "var(--dc-hover)" }}>
          <div style={{ height: 8, borderRadius: 4, width: `${pct}%`, background: "var(--dc-accent)" }} />
        </div>
      </div>
    </div>
  );
}

function RuleCard({ t }: { t: LearnCopy }) {
  return (
    <div style={{ background: "var(--dc-accent-soft)", borderRadius: 32, padding: 28, display: "flex", flexDirection: "column", gap: 10 }} data-fx>
      <span style={{ fontSize: 13, fontWeight: 500, color: "var(--dc-accent)" }}>{t.rule.title}</span>
      <span style={{ fontSize: 20, fontWeight: 600, lineHeight: 1.3 }}>{t.rule.body}</span>
    </div>
  );
}

/** Too few practice messages in this language: say so, and offer another set (never swap silently). */
function LanguageNote({ pool, t, copy, onAccept }: { pool: LanguagePool; t: LearnCopy; copy: Copy; onAccept: () => void }) {
  const L = copy.learn;
  return (
    <section style={{ ...card(32), padding: 28, display: "flex", flexDirection: "column", gap: 14 }} aria-labelledby="quiz-label">
      <p id="quiz-label" style={{ margin: 0, fontSize: 13, color: "var(--dc-text3)" }}>
        {t.eyebrow}
      </p>
      <p style={{ margin: 0, fontSize: 20, fontWeight: 600, letterSpacing: "-0.02em" }}>{L.fewItems(L.languageName[pool.lang])}</p>
      {pool.fallback && (
        <>
          <Pill onClick={onAccept} height={52}>
            {L.offerOther(L.languageName[pool.fallback])}
          </Pill>
          {pool.fallback === "kreol" && <p style={{ margin: 0, fontSize: 14, color: "var(--dc-text3)" }}>{L.kreolMixNote}</p>}
        </>
      )}
    </section>
  );
}

/** `next dev` only: replay the daily celebration on demand. */
function DevTools({ copy, onReset, onSeed }: { copy: Copy; onReset: () => void; onSeed: () => void }) {
  return (
    <section style={{ border: "1px dashed var(--dc-line-strong)", borderRadius: 20, padding: 16, display: "flex", flexDirection: "column", gap: 10 }} aria-label={copy.learn.dev.title}>
      <p style={{ margin: 0, fontSize: 12, color: "var(--dc-text3)" }}>{copy.learn.dev.title}</p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        <Pill variant="outline" height={40} onClick={onReset}>
          {copy.learn.dev.reset}
        </Pill>
        <Pill variant="outline" height={40} onClick={onSeed}>
          {copy.learn.dev.seed}
        </Pill>
      </div>
    </section>
  );
}

type Answer = { choseScam: boolean; correct: boolean };

function Quiz({
  items,
  quizLang,
  copy,
  t,
  lang,
  onAnswered,
  onFinished,
  best,
  goalMet,
}: {
  items: QuizItem[];
  quizLang: QuizLanguage;
  copy: Copy;
  t: LearnCopy;
  lang: UiLanguage;
  onAnswered: (item: QuizItem, correct: boolean) => void;
  onFinished: (score: number, total: number) => void;
  best: { score: number; total: number } | null;
  /** Whether today's daily goal was already met before this round started. */
  goalMet: boolean;
}) {
  const [round, setRound] = useState<QuizItem[]>(() => buildRound(items, quizLang));
  const [index, setIndex] = useState(0);
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [score, setScore] = useState(0);
  const [finished, setFinished] = useState(false);
  const cardRef = useRef<HTMLElement>(null);
  const nextRef = useRef<HTMLButtonElement>(null);
  const playAgainRef = useRef<HTMLButtonElement>(null);
  const moved = useRef(false);
  const L = copy.learn;

  useEffect(() => {
    if (!answer) return;
    nextRef.current?.focus({ preventScroll: true });
    nextRef.current?.scrollIntoView({ block: "nearest", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  }, [answer]);

  useEffect(() => {
    if (!moved.current) return;
    cardRef.current?.scrollIntoView({ block: "nearest", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    if (finished) playAgainRef.current?.focus({ preventScroll: true });
  }, [index, finished]);

  if (round.length === 0) return null;

  if (finished) {
    const doneForToday = !goalMet; // this round is the one that met (or re-confirms) today's goal
    return (
      <section ref={cardRef} style={{ ...card(32, true), padding: "36px 40px 40px", display: "flex", flexDirection: "column", gap: 14 }} aria-live="polite">
        <p style={{ margin: 0, fontSize: 13, color: "var(--dc-text3)" }}>{doneForToday ? t.doneToday : L.scoreLabel}</p>
        <p className="dc-mono" style={{ margin: 0, fontFamily: MONO, fontSize: 44, fontWeight: 700, lineHeight: 1, color: "var(--dc-ink)" }}>
          {score} <span style={{ fontSize: 18, fontWeight: 500, color: "var(--dc-text3)" }}>/ {round.length}</span>
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <p style={{ margin: 0, fontSize: 16, fontWeight: 500 }}>{L.scoreLine(score, round.length)}</p>
          <p style={{ margin: 0, fontSize: 14, lineHeight: 1.5, color: "var(--dc-text2)" }}>{L.scoreComment(score, round.length)}</p>
        </div>
        {best && <p style={{ margin: 0, fontSize: 13, color: "var(--dc-text3)" }}>{L.best(best.score, best.total)}</p>}
        <button
          ref={playAgainRef}
          type="button"
          onClick={() => {
            setRound(buildRound(items, quizLang, Math.random));
            setIndex(0);
            setScore(0);
            setAnswer(null);
            setFinished(false);
          }}
          style={{ ...pillStyle("ink", 52), marginTop: 4, width: "100%" }}
        >
          {t.practiceMore}
        </button>
      </section>
    );
  }

  const item = round[index];
  const choose = (choseScam: boolean) => {
    if (answer) return;
    const correct = choseScam === item.isScam;
    setAnswer({ choseScam, correct });
    if (correct) setScore((s) => s + 1);
    onAnswered(item, correct);
  };
  const next = () => {
    moved.current = true;
    if (index + 1 < round.length) {
      setIndex(index + 1);
      setAnswer(null);
    } else {
      setFinished(true);
      onFinished(score, round.length);
    }
  };

  return (
    <section ref={cardRef} style={{ ...card(32, true), padding: "36px 40px 40px", display: "flex", flexDirection: "column", gap: 28 }} aria-labelledby="quiz-label">
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <span id="quiz-label" className="dc-mono" style={{ fontFamily: MONO, fontSize: 12, color: "var(--dc-accent)", letterSpacing: "0.04em" }}>
          {`MESSAGE ${index + 1} OF ${round.length}`.toUpperCase()}
        </span>
        <div style={{ display: "flex", gap: 6 }} aria-hidden="true">
          {Array.from({ length: round.length }, (_, i) => (
            <span
              key={i}
              style={{
                width: 28,
                height: 6,
                borderRadius: 999,
                background: i < index ? "var(--dc-accent)" : i === index ? "var(--dc-ink)" : "var(--dc-line-strong)",
              }}
            />
          ))}
        </div>
      </div>

      <div style={{ background: "var(--dc-bg)", borderRadius: 24, padding: 28, display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span
            aria-hidden="true"
            style={{
              width: 40,
              height: 40,
              borderRadius: "50%",
              background: "var(--dc-line-strong)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 16,
              fontWeight: 600,
              color: "var(--dc-ink)",
              flexShrink: 0,
            }}
          >
            {senderLabel(item, t.senderGenuine).charAt(0).toUpperCase()}
          </span>
          <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
            <span style={{ fontSize: 15, fontWeight: 500 }}>{senderLabel(item, t.senderGenuine)}</span>
            {item.languageMix !== lang && item.languageMix !== "en" && (
              <span style={{ fontSize: 12, color: "var(--dc-text3)" }}>{languageLabel(item.languageMix)}</span>
            )}
          </div>
        </div>

        <blockquote
          key={item.id}
          lang={item.languageMix === "en" ? "en" : item.languageMix.startsWith("mfe") ? "mfe" : undefined}
          style={{ margin: 0, background: "var(--dc-bubble)", borderRadius: "6px 22px 22px 22px", padding: "16px 20px", fontSize: 18, lineHeight: 1.5, fontWeight: 500, maxWidth: 540, overflowWrap: "anywhere" }}
        >
          &ldquo;{item.text}&rdquo;
        </blockquote>
      </div>

      {!answer && <span style={{ fontSize: 22, fontWeight: 600 }}>{t.question}</span>}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        {([true, false] as const).map((isScamButton) => {
          const chosen = answer?.choseScam === isScamButton;
          const cls = [
            styles.btn,
            isScamButton ? styles.scam : styles.genuine,
            chosen ? (isScamButton ? styles.scamChosen : styles.genuineChosen) : "",
            answer && !chosen ? styles.dimmed : "",
          ]
            .filter(Boolean)
            .join(" ");
          return (
            <button
              key={String(isScamButton)}
              type="button"
              onClick={() => choose(isScamButton)}
              disabled={!!answer}
              className={cls}
              style={{ width: "100%", boxShadow: chosen ? "0 0 0 2px var(--dc-accent)" : "none" }}
            >
              <span
                aria-hidden="true"
                style={{ width: 8, height: 8, borderRadius: "50%", background: isScamButton ? TONE.red.dot : TONE.green.dot }}
              />
              {isScamButton ? L.scam : L.genuine}
            </button>
          );
        })}
      </div>

      {answer && <Reveal item={item} answer={answer} copy={copy} lang={lang} />}

      {answer && (
        <button ref={nextRef} type="button" onClick={next} style={{ ...pillStyle("ink", 52), width: "100%" }}>
          {index + 1 < round.length ? L.next : L.seeScore}
        </button>
      )}
    </section>
  );
}

/** Why it's a scam (result-screen signal titles) or why it's genuine (result-screen SAFE ticks). Both come from real item data. */
function Reveal({ item, answer, copy, lang }: { item: QuizItem; answer: Answer; copy: Copy; lang: UiLanguage }) {
  const L = copy.learn;
  const reasons = item.isScam
    ? item.reasons.slice(0, 4).map((k) => copy.result.signalTitles[k])
    : safeChecks([], item.text, redact(item.text).redactions).map((k) => copy.result.checks[k]);
  const showMeaning = lang !== "kreol" && item.languageMix !== "en" && item.englishMeaning;
  const tone = item.isScam ? TONE.red : TONE.green;

  return (
    <div role="status" style={{ display: "flex", flexDirection: "column", gap: 16, background: tone.hl, borderRadius: 24, padding: 20 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <span
          aria-hidden="true"
          style={{ width: 48, height: 48, borderRadius: 16, background: "var(--dc-surface)", color: tone.fg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, fontWeight: 700, flexShrink: 0 }}
        >
          {item.isScam ? "✕" : "✓"}
        </span>
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <span style={{ fontSize: 22, fontWeight: 600, color: tone.fg }}>{item.isScam ? L.isScam : L.isGenuine}</span>
          <span style={{ fontSize: 15, color: "var(--dc-text2)" }}>{answer.correct ? L.correct : L.incorrect}</span>
        </div>
      </div>
      {reasons.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
          <p style={{ margin: "0 0 8px", fontSize: 13, color: "var(--dc-text3)" }}>{L.whyLabel}</p>
          <ul style={{ display: "flex", flexDirection: "column", margin: 0, padding: 0, listStyle: "none" }}>
            {reasons.map((r, i) => (
              <li
                key={r}
                style={{ display: "grid", gridTemplateColumns: "28px 1fr", gap: 8, fontSize: 16, lineHeight: 1.4, padding: "10px 0", borderTop: i === 0 ? "none" : "1px solid var(--dc-line2)" }}
              >
                <span className="dc-mono" style={{ fontFamily: MONO, fontSize: 12, color: "var(--dc-text3)" }}>{String(i + 1).padStart(2, "0")}</span>
                <span>{r}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {showMeaning && (
        <p style={{ margin: 0, fontSize: 13, lineHeight: 1.5, color: "var(--dc-text2)" }}>
          <span style={{ fontWeight: 600, color: "var(--dc-ink)" }}>{L.inEnglish}:</span> {item.englishMeaning}
        </p>
      )}
    </div>
  );
}

const TAG_TONE: Record<TrendCard["category"], typeof TONE.red> = {
  parcel_fee: TONE.amber,
  fake_relative: TONE.red,
  investment: TONE.green,
};

/**
 * "Common scam patterns" (Learn.dc.html): a full-width section below the
 * quiz, 3 real corpus examples (loaded server-side by /learn). Bullet lines
 * are the real copy sentence-split, never padded with invented facts.
 */
function PatternsSection({ trends, items, copy, t }: { trends: TrendCard[]; items: QuizItem[]; copy: Copy; t: LearnCopy }) {
  const L = copy.learn;
  return (
    <section data-fx>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 20, flexWrap: "wrap", marginBottom: 24 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <h2 style={{ margin: 0, fontSize: 36, fontWeight: 600, letterSpacing: "-0.03em" }}>{t.patterns.title}</h2>
          <p style={{ margin: 0, fontSize: 16, color: "var(--dc-text2)" }}>{t.patterns.sub}</p>
        </div>
        <Pill href="/trends" variant="ghost" height={36} pad={0}>
          {t.patterns.seeAll} →
        </Pill>
      </div>
      <div className="dc-cols-1" style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0,1fr))", gap: 20 }}>
        {trends.map((tr) => {
          const tone = TAG_TONE[tr.category];
          const sourceItem = tr.example ? items.find((i) => i.id === tr.example!.id) : undefined;
          const bullets = L.trends[tr.category].body.split(/(?<=[.!?])\s+/).filter(Boolean);
          return (
            <div key={tr.category} style={{ ...card(32), padding: 28, display: "flex", flexDirection: "column", gap: 16 }} data-fx>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                <span style={{ fontSize: 22, fontWeight: 600 }}>{L.trends[tr.category].tag}</span>
                {sourceItem && (
                  <span
                    className="dc-mono"
                    style={{ fontFamily: MONO, fontSize: 11, color: "var(--dc-text3)", background: "var(--dc-hover)", padding: "4px 8px", borderRadius: 999, flexShrink: 0 }}
                  >
                    {languageLabel(sourceItem.languageMix)}
                  </span>
                )}
              </div>
              {tr.example && (
                <p style={{ margin: 0, background: "var(--dc-bubble)", borderRadius: 14, padding: "12px 16px", fontSize: 15, lineHeight: 1.5, overflowWrap: "anywhere" }}>
                  &ldquo;{tr.example.text}&rdquo;
                </p>
              )}
              <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 8 }}>
                {bullets.map((b) => (
                  <li key={b} style={{ display: "flex", gap: 8, fontSize: 14, lineHeight: 1.5, color: "var(--dc-text2)" }}>
                    <span aria-hidden="true" style={{ color: tone.fg }}>•</span>
                    {b}
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </section>
  );
}

const LANGUAGE_NAMES: Record<string, string> = { en: "English", fr: "Français", mfe: "Kreol" };

/** "mfe+en" -> "Kreol + English": the data's language codes, in words a reader knows. */
function languageLabel(mix: string): string {
  return mix
    .split(/[+_,\s]+/)
    .filter(Boolean)
    .map((code) => LANGUAGE_NAMES[code.toLowerCase()] ?? code)
    .join(" + ");
}

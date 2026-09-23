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
import { ChartIcon, CheckIcon, PersonIcon, WarningIcon } from "../icons";
import Celebration from "./Celebration";
import StreakCards from "./StreakCards";
import { learnCopy, fill, type LearnCopy } from "./content";

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
 * Learn tab, restyled to the Claude Design system (components/dc). Fully
 * client-side over build-time corpus data: no API call. A round is exactly
 * DAILY_GOAL (5) questions, so the quiz card's own position counter and the
 * daily-goal bar always agree.
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
  const week = state ? weekHistory(state, today) : [];

  return (
    <>
      <DcPage label="learn" maxWidth={1180} gap={36}>
        <PageHeader eyebrow={t.eyebrow} title={t.title} lede={t.lede} titleSize={48} />

        {ready && state && <StreakCards state={state} today={today} t={t} />}

        {ready && state && (
          <div style={{ ...card(28), padding: "20px 24px", display: "flex", flexDirection: "column", gap: 10 }} data-fx>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
              <span style={{ fontSize: 14, fontWeight: 600, color: "var(--dc-ink)" }}>{t.goal.title}</span>
              <span style={{ fontSize: 13, color: "var(--dc-text3)" }}>
                {done >= DAILY_GOAL ? t.goal.done : fill(t.goal.more, { n: DAILY_GOAL - done })}
              </span>
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              {Array.from({ length: DAILY_GOAL }, (_, i) => (
                <span
                  key={i}
                  aria-hidden="true"
                  style={{ height: 6, flex: 1, borderRadius: 3, background: i < done ? "var(--dc-accent)" : "var(--dc-line2)" }}
                />
              ))}
            </div>
          </div>
        )}

        {ready && state && <WeekStrip week={week} t={t} />}

        <div className="dc-split" style={{ display: "grid", gridTemplateColumns: "minmax(0,1.15fr) minmax(0,0.85fr)", gap: 20, alignItems: "start" }}>
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

            <div style={{ ...card(28), padding: 24, display: "flex", flexDirection: "column", gap: 10 }} data-fx>
              <h2 style={{ margin: 0, fontSize: 17, fontWeight: 600 }}>{t.rule.title}</h2>
              <p style={{ margin: 0, fontSize: 15, lineHeight: 1.55, color: "var(--dc-text2)" }}>{t.rule.body}</p>
            </div>
          </div>

          <Patterns trends={trends} copy={copy} t={t} />
        </div>

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

function WeekStrip({ week, t }: { week: ReturnType<typeof weekHistory>; t: LearnCopy }) {
  const WD = ["S", "M", "T", "W", "T", "F", "S"];
  return (
    <div style={{ ...card(28), padding: "20px 24px", display: "flex", flexDirection: "column", gap: 14 }} data-fx>
      <span style={{ fontSize: 14, fontWeight: 600, color: "var(--dc-ink)" }}>{t.week.title}</span>
      <div style={{ display: "flex", gap: 10 }}>
        {week.map((d) => {
          const dow = new Date(`${d.day}T00:00:00`).getDay();
          return (
            <div key={d.day} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, flex: 1, minWidth: 0 }}>
              <div
                aria-hidden="true"
                style={{
                  width: "100%",
                  height: 36,
                  borderRadius: 10,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background: d.goalMet ? "var(--dc-accent)" : d.answered > 0 ? "var(--dc-accent-soft)" : "var(--dc-hover)",
                  color: d.goalMet ? "var(--dc-surface)" : "var(--dc-text3)",
                  fontSize: 12,
                  fontWeight: 600,
                }}
              >
                {d.answered > 0 ? d.answered : ""}
              </div>
              <span style={{ fontSize: 11, color: "var(--dc-text3)" }}>{WD[dow]}</span>
            </div>
          );
        })}
      </div>
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
      <section ref={cardRef} style={{ ...card(32), padding: 28, display: "flex", flexDirection: "column", gap: 14 }} aria-live="polite">
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
    <section ref={cardRef} style={{ ...card(32), padding: 28, display: "flex", flexDirection: "column", gap: 16 }} aria-labelledby="quiz-label">
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span id="quiz-label" className="dc-mono" style={{ fontFamily: MONO, fontSize: 12, color: "var(--dc-accent)", letterSpacing: "0.04em" }}>
            {`MESSAGE ${index + 1} OF ${round.length}`.toUpperCase()}
          </span>
        </div>
        <div style={{ display: "flex", gap: 6 }} aria-hidden="true">
          {Array.from({ length: round.length }, (_, i) => (
            <span key={i} style={{ height: 5, flex: 1, borderRadius: 3, background: i <= index ? "var(--dc-accent)" : "var(--dc-line2)" }} />
          ))}
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 13, fontWeight: 500, padding: "4px 10px", borderRadius: 999, background: "var(--dc-hover)", color: "var(--dc-text2)" }}>
          {senderLabel(item, t.senderGenuine)}
        </span>
        {item.languageMix !== lang && item.languageMix !== "en" && (
          <span style={{ fontSize: 12, color: "var(--dc-text3)" }}>{item.languageMix}</span>
        )}
      </div>

      <blockquote
        key={item.id}
        lang={item.languageMix === "en" ? "en" : item.languageMix.startsWith("mfe") ? "mfe" : undefined}
        style={{ margin: 0, background: "var(--dc-bubble)", borderRadius: 20, padding: "16px 18px", fontSize: 17, lineHeight: 1.5, fontWeight: 500, overflowWrap: "anywhere" }}
      >
        &ldquo;{item.text}&rdquo;
      </blockquote>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        {([true, false] as const).map((isScamButton) => {
          const chosen = answer?.choseScam === isScamButton;
          return (
            <Pill
              key={String(isScamButton)}
              type="button"
              onClick={() => choose(isScamButton)}
              disabled={!!answer}
              variant={isScamButton ? "ink" : "outline"}
              height={52}
              style={{ width: "100%", opacity: answer && !chosen ? 0.4 : 1, boxShadow: chosen ? "0 0 0 2px var(--dc-accent)" : "none" }}
            >
              {isScamButton ? L.scam : L.genuine}
            </Pill>
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
    <div role="status" style={{ display: "flex", flexDirection: "column", gap: 10, background: tone.hl, borderRadius: 18, padding: 16 }}>
      <p style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>
        <span style={{ color: answer.correct ? "var(--dc-green)" : "var(--dc-red)" }}>{answer.correct ? L.correct : L.incorrect}</span>{" "}
        {item.isScam ? L.isScam : L.isGenuine}
      </p>
      {reasons.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <p style={{ margin: 0, fontSize: 12, color: "var(--dc-text3)" }}>{L.whyLabel}</p>
          <ul style={{ display: "flex", flexDirection: "column", gap: 6, margin: 0, padding: 0, listStyle: "none" }}>
            {reasons.map((r) => (
              <li key={r} style={{ display: "flex", alignItems: "flex-start", gap: 10, fontSize: 14, lineHeight: 1.4 }}>
                {item.isScam ? (
                  <span aria-hidden="true" style={{ marginTop: 6, width: 6, height: 6, borderRadius: "50%", background: "var(--dc-red)", flexShrink: 0 }} />
                ) : (
                  <span aria-hidden="true" style={{ marginTop: 2, color: "var(--dc-green)", display: "inline-flex", flexShrink: 0 }}>
                    <CheckIcon className="size-4" strokeWidth={2.5} />
                  </span>
                )}
                {r}
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

const TAG_TONE: Record<TrendCard["category"], { tone: typeof TONE.red; Icon: typeof WarningIcon }> = {
  parcel_fee: { tone: TONE.amber, Icon: WarningIcon },
  fake_relative: { tone: TONE.red, Icon: PersonIcon },
  investment: { tone: TONE.green, Icon: ChartIcon },
};

/** "Common scam patterns": each row's example is a real corpus row, its language tag the item's own languageMix. */
function Patterns({ trends, copy, t }: { trends: TrendCard[]; copy: Copy; t: LearnCopy }) {
  const L = copy.learn;
  return (
    <section className="dc-sticky" style={{ ...card(32), padding: 24, display: "flex", flexDirection: "column", gap: 18, position: "sticky", top: 92 }} data-fx>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
        <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>{t.patterns.title}</h2>
      </div>
      <ul style={{ display: "flex", flexDirection: "column", gap: 16, margin: 0, padding: 0, listStyle: "none" }}>
        {trends.map((tr) => {
          const tone = TAG_TONE[tr.category].tone;
          const Icon = TAG_TONE[tr.category].Icon;
          return (
            <li key={tr.category} style={{ display: "flex", flexDirection: "column", gap: 8, paddingTop: 4, borderTop: "1px solid var(--dc-line2)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, paddingTop: 12 }}>
                <span aria-hidden="true" style={{ width: 30, height: 30, borderRadius: "50%", background: tone.hl, color: tone.fg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <Icon className="size-[15px]" strokeWidth={2} />
                </span>
                <span style={{ fontSize: 15, fontWeight: 500 }}>{L.trends[tr.category].tag}</span>
              </div>
              {tr.example && (
                <p style={{ margin: 0, background: "var(--dc-hover)", borderRadius: 14, padding: "10px 14px", fontSize: 13, lineHeight: 1.5, color: "var(--dc-text2)", overflowWrap: "anywhere" }}>
                  &ldquo;{tr.example.text}&rdquo;
                </p>
              )}
              <p style={{ margin: 0, fontSize: 13, lineHeight: 1.5, color: "var(--dc-text3)" }}>{L.trends[tr.category].body}</p>
            </li>
          );
        })}
      </ul>
      <Pill href="/trends" variant="outline" height={44} style={{ width: "100%" }}>
        {t.patterns.seeAll}
      </Pill>
    </section>
  );
}

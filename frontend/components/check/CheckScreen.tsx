"use client";

import { useEffect, useRef, useState } from "react";
import { getRecentChecks, getStreakState, type RecentCheck } from "@/lib/storage";
import { visibleStreak } from "@/lib/streak";
import { localDay } from "@/lib/learn-content";
import { weekStats, type WeekStats } from "@/lib/week";
import CheckForm, { type CheckFormHandle } from "../CheckForm";
import type { WaitPhase } from "../WaitProgress";
import { useLanguage } from "../LanguageProvider";
import RecentChecks from "../RecentChecks";
import ScreenTitle from "../ScreenTitle";
import CheckHero from "./CheckHero";
import CheckingHero, { ResultSkeleton } from "./CheckingHero";
import InstallCard from "./InstallCard";
import PayRow from "./PayRow";
import { PracticeCard, WeekCard } from "./WeekCard";

/**
 * The Check screen (frontend/design/mockup/Main.html), in the order drawn:
 * large title, dark hero, the SafePay row, the This week / Practice pair, the
 * install suggestion and the Recent list.
 *
 * It owns the local reads — check history and the Learn streak — so the week
 * counts and the Recent list describe one and the same history, read once.
 * Everything below the hero is hidden while a check is running: the mockup's
 * Checking screen shows the hero plus result placeholders, nothing else.
 */
export default function CheckScreen() {
  const { copy } = useLanguage();
  const form = useRef<CheckFormHandle>(null);

  // null until mounted: localStorage is not available during server render,
  // and `now` stays 0 so the first client render matches the server's.
  const [checks, setChecks] = useState<RecentCheck[] | null>(null);
  const [week, setWeek] = useState<WeekStats | null>(null);
  const [practice, setPractice] = useState<{ answered: number; streak: number } | null>(null);
  const [now, setNow] = useState(0);
  const [{ open, shotBusy, loading, phase, stage, reveal }, setFormState] = useState<{
    open: boolean;
    shotBusy: boolean;
    loading: boolean;
    phase: WaitPhase;
    stage: number;
    reveal: string[];
  }>({ open: false, shotBusy: false, loading: false, phase: "running", stage: 0, reveal: [] });
  // On a phone an open field takes over the screen and the cards step aside;
  // on desktop the field lives in its own column and nothing needs to move.
  const [desktop, setDesktop] = useState(false);

  useEffect(() => {
    const list = getRecentChecks();
    const at = Date.now();
    setChecks(list);
    setWeek(weekStats(list, at));
    setNow(at);

    setDesktop(window.matchMedia("(min-width: 64rem)").matches);

    const today = localDay();
    const streak = getStreakState(today);
    setPractice({ answered: streak.today.answered, streak: visibleStreak(streak, today) });

    // Keep "2h ago" honest on a screen left open, without re-reading storage.
    const tick = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(tick);
  }, []);

  // While checking, the cards give way to the result placeholders either way.
  const hidden = loading || (open && !desktop);

  return (
    <>
      <ScreenTitle tabKey="check" />

      {/*
        * Phone: one column, in the order drawn. Desktop (.screen-grid, lg+):
        * the check itself on the left, the standing information — this week,
        * practice, install, recent — on the right, so the width carries a
        * second column instead of stretching one.
        */}
      <div className="gutter screen-grid flex flex-col gap-4 pt-4 lg:grid">
        <div className="flex flex-col gap-4">
          {/* The hero becomes the wait while a check runs, rather than the
              screen navigating to a separate checking route: the abort and
              cancel behaviour all lives in CheckForm, which stays mounted. */}
          {loading ? (
            <CheckingHero
              copy={copy}
              phase={phase}
              stage={stage}
              reveal={reveal}
              progressLabel={copy.wait.progressLabel}
            />
          ) : (
            <CheckHero
              copy={copy}
              onPaste={() => form.current?.pasteAndFocus()}
              onScreenshot={() => form.current?.pickScreenshot()}
              screenshotBusy={shotBusy}
            />
          )}

          <CheckForm ref={form} onStateChange={setFormState} />

          {!hidden && <PayRow copy={copy} />}
        </div>

        <div className="flex flex-col gap-4">
          {loading && <ResultSkeleton />}

          {!hidden && (
            <>
              {(week !== null && week.total > 0) || practice !== null ? (
                <div className="grid grid-cols-12 items-start gap-3.5">
                  {week !== null && week.total > 0 && <WeekCard stats={week} copy={copy} />}
                  {practice !== null && (
                    <PracticeCard answered={practice.answered} streak={practice.streak} copy={copy} />
                  )}
                </div>
              ) : null}

              <InstallCard copy={copy} />

              {checks !== null && <RecentChecks checks={checks} now={now} />}
            </>
          )}
        </div>
      </div>
    </>
  );
}

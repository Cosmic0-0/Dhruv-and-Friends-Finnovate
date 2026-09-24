/**
 * Settings > "Scam alerts" and "Daily practice reminder": real browser
 * Notifications, gated on the Notification permission and each toggle.
 * No push server exists, so nothing is delivered while the browser itself
 * isn't running; "in the background" means two honest, best-effort things:
 *
 * 1. A foreground poll (startNotificationSchedules) that runs while any
 *    FraudLens tab is open, on an interval and on tab-visibility change.
 * 2. A Periodic Background Sync registration (tryRegisterPeriodicSync),
 *    which most browsers do not grant (Chromium only, installed PWA, site
 *    engagement heuristics) - public/sw.js's "periodicsync" handler runs
 *    the same checks when it fires. Both paths read real data
 *    (GET /api/trends, the Learn streak) and never invent activity; an
 *    empty/offline result simply produces no notification.
 *
 * Scam alerts: GET /api/trends' topCampaigns, compared against the
 * fingerprintId -> messageCount map already seen (lib/storage.ts
 * loadScamAlerts/saveScamAlerts), so only a new or growing campaign alerts
 * (see that file's doc comment). The service worker cannot reach
 * localStorage, so the same "seen" map (and the practice-reminder status)
 * is mirrored into the Cache Storage API, which both contexts can read.
 *
 * Daily practice reminder: fires once, in the evening, only if today's
 * Learn goal (lib/streak.ts DAILY_GOAL) isn't met yet.
 */

import { settingsCopy } from "@/components/settings/content";
import { getTrends } from "./intelligence-api";
import { DAILY_GOAL } from "./streak";
import { localDay } from "./learn-content";
import {
  getStreakState,
  loadLanguage,
  loadPracticeReminder,
  loadScamAlerts,
  savePracticeReminder,
  saveScamAlerts,
} from "./storage";

export type NotifPermission = "granted" | "denied" | "default" | "unsupported";

/** Current Notification permission, without prompting. */
export function notificationSupport(): NotifPermission {
  if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
  return Notification.permission;
}

/** Prompts the browser's permission dialog. Only call this from a user gesture (a toggle click). */
export async function requestNotificationPermission(): Promise<NotifPermission> {
  if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
  try {
    return await Notification.requestPermission();
  } catch {
    return "denied";
  }
}

function fmt(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => vars[key] ?? "");
}

async function showNotification(title: string, body: string, tag: string, url: string): Promise<void> {
  if (typeof window === "undefined" || !("Notification" in window) || Notification.permission !== "granted") return;
  try {
    if ("serviceWorker" in navigator) {
      const reg = await navigator.serviceWorker.getRegistration();
      if (reg) {
        await reg.showNotification(title, { body, tag, icon: "/icons/icon-192.png", data: { url } });
        return;
      }
    }
    const n = new Notification(title, { body, tag, icon: "/icons/icon-192.png" });
    n.onclick = () => {
      window.focus();
      window.location.href = url;
    };
  } catch (err) {
    console.warn("[notifications] showNotification failed", err);
  }
}

// ---- Cache Storage mirror: the only storage a service worker can also read ----

const MIRROR_CACHE = "fraudlens-notify-v1";
const CAMPAIGNS_SEEN_KEY = "/__notify/campaigns-seen";
const PRACTICE_STATUS_KEY = "/__notify/practice-status";

interface PracticeMirror {
  day: string;
  answered: number;
  goal: number;
  on: boolean;
  lastShown: string | null;
}

async function mirrorWrite(key: string, value: unknown): Promise<void> {
  try {
    if (!("caches" in window)) return;
    const cache = await caches.open(MIRROR_CACHE);
    await cache.put(key, new Response(JSON.stringify(value)));
  } catch {
    /* Cache Storage unavailable (private mode, unsupported): the foreground path still works. */
  }
}

// ---- Scam alerts (Settings > "Scam alerts") ----

/** Minimum growth in a campaign's message count worth a fresh notification, so +1 doesn't spam. */
const GROWTH_THRESHOLD = 3;

export async function checkScamAlerts(): Promise<void> {
  if (typeof window === "undefined") return;
  const state = loadScamAlerts();
  if (!state.on || Notification.permission !== "granted") return;

  let data: Awaited<ReturnType<typeof getTrends>>;
  try {
    data = await getTrends();
  } catch {
    return; // offline or backend down: try again on the next poll
  }

  const seen = { ...state.seen };
  const firstRun = Object.keys(seen).length === 0;
  const lang = loadLanguage() ?? "en";
  const t = settingsCopy(lang).notifications;
  let alerted = false;

  for (const c of data.topCampaigns) {
    const prev = seen[c.fingerprintId];
    const isNew = prev === undefined;
    const grew = prev !== undefined && c.messageCount - prev >= GROWTH_THRESHOLD;
    // The first check after turning the setting on just establishes a
    // baseline; every pre-existing campaign would otherwise look "new".
    if (!firstRun && (isNew || grew) && !alerted) {
      const name = c.claimedIdentity ?? c.scamType.replace(/_/g, " ");
      await showNotification(
        fmt(t.alertTitle, { name }),
        fmt(t.alertBody, { count: String(c.messageCount) }),
        `scam-alert-${c.fingerprintId}`,
        "/trends",
      );
      alerted = true;
    }
    seen[c.fingerprintId] = c.messageCount;
  }

  saveScamAlerts({ on: true, seen });
  await mirrorWrite(CAMPAIGNS_SEEN_KEY, seen);
}

// ---- Daily practice reminder (Settings > "Daily practice reminder") ----

/** "One evening nudge": don't fire before this local hour. */
const EVENING_HOUR = 18;

export async function checkPracticeReminder(): Promise<void> {
  if (typeof window === "undefined") return;
  const state = loadPracticeReminder();
  if (!state.on || Notification.permission !== "granted") return;

  const today = localDay();
  const streak = getStreakState(today);
  const done = streak.today.day === today && streak.today.answered >= DAILY_GOAL;

  if (!done && state.lastShown !== today && new Date().getHours() >= EVENING_HOUR) {
    const lang = loadLanguage() ?? "en";
    const t = settingsCopy(lang).notifications;
    await showNotification(t.practiceTitle, t.practiceBody, "practice-reminder", "/learn");
    savePracticeReminder({ on: true, lastShown: today });
  }

  const mirror: PracticeMirror = {
    day: today,
    answered: streak.today.day === today ? streak.today.answered : 0,
    goal: DAILY_GOAL,
    on: state.on,
    lastShown: loadPracticeReminder().lastShown,
  };
  await mirrorWrite(PRACTICE_STATUS_KEY, mirror);
}

// ---- Foreground scheduler ----

const POLL_MS = 5 * 60 * 1000;

/** Starts polling while this tab is open. Returns a cleanup function. Safe to call even if both toggles are off. */
export function startNotificationSchedules(): () => void {
  if (typeof window === "undefined") return () => {};

  const runChecks = () => {
    void checkScamAlerts();
    void checkPracticeReminder();
  };

  runChecks();
  const timer = setInterval(runChecks, POLL_MS);
  const onVisible = () => {
    if (document.visibilityState === "visible") runChecks();
  };
  document.addEventListener("visibilitychange", onVisible);

  return () => {
    clearInterval(timer);
    document.removeEventListener("visibilitychange", onVisible);
  };
}

// ---- Best-effort background delivery (Periodic Background Sync) ----

interface PeriodicSyncManager {
  register: (tag: string, options: { minInterval: number }) => Promise<void>;
}

/**
 * Attempts to register a Periodic Background Sync tag so public/sw.js's
 * "periodicsync" handler can run the same check without the app open.
 * Most browsers never grant this (see the file doc comment); this quietly
 * resolves false rather than surfacing an error when it isn't available.
 */
export async function tryRegisterPeriodicSync(tag: string, minIntervalMs: number): Promise<boolean> {
  try {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator) || !("permissions" in navigator)) return false;
    const reg = await navigator.serviceWorker.ready;
    const periodicSync = (reg as ServiceWorkerRegistration & { periodicSync?: PeriodicSyncManager }).periodicSync;
    if (!periodicSync) return false;
    const status = await navigator.permissions.query({ name: "periodic-background-sync" as PermissionName });
    if (status.state !== "granted") return false;
    await periodicSync.register(tag, { minInterval: minIntervalMs });
    return true;
  } catch {
    return false;
  }
}

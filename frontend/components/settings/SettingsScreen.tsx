"use client";

import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { card, DcPage, PageHeader, Pill, Seg } from "@/components/dc";
import { useLanguage } from "@/components/LanguageProvider";
import { UI_LANGUAGES, type UiLanguage } from "@/lib/i18n";
import { applyTheme, loadTheme, saveTheme, type ThemeChoice } from "@/lib/theme";
import {
  notificationSupport,
  requestNotificationPermission,
  tryRegisterPeriodicSync,
  type NotifPermission,
} from "@/lib/notifications";
import {
  clearCheckHistory,
  loadKeepHistory,
  loadPracticeReminder,
  loadScamAlerts,
  loadShareSamples,
  loadSimpleMode,
  saveKeepHistory,
  savePracticeReminder,
  saveScamAlerts,
  saveShareSamples,
  saveSimpleMode,
} from "@/lib/storage";
import { REPO_URL } from "@/lib/team";
import { settingsCopy } from "./content";
import Toggle from "./Toggle";

const rowStyle: CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 24, padding: "22px 0" };
const groupLabel: CSSProperties = { fontSize: 13, color: "var(--dc-text3)", padding: "0 4px 6px" };
const rowText: CSSProperties = { display: "flex", flexDirection: "column", gap: 4, minWidth: 0, maxWidth: 460 };
const rowTitle: CSSProperties = { fontSize: 16, fontWeight: 500, color: "var(--dc-ink)" };
const rowDesc: CSSProperties = { fontSize: 14, lineHeight: 1.5, color: "var(--dc-text3)" };
const noteStyle: CSSProperties = { fontSize: 13, color: "var(--dc-amber)", marginTop: -8 };

function Group({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      <span className="dc-mono" style={{ ...groupLabel, letterSpacing: "0.04em" }}>{label}</span>
      <div data-fx className="dc-panel" style={{ ...card(28), padding: "0 28px" }}>
        {children}
      </div>
    </div>
  );
}

function Row({ title, desc, control, note, divider = true }: { title: string; desc: string; control: ReactNode; note?: string; divider?: boolean }) {
  return (
    <div style={{ ...rowStyle, borderTop: divider ? "1px solid var(--dc-line2)" : "none", flexWrap: "wrap" }}>
      <div style={rowText}>
        <span style={rowTitle}>{title}</span>
        <span style={rowDesc}>{desc}</span>
        {note && <span style={noteStyle}>{note}</span>}
      </div>
      <div style={{ flexShrink: 0 }}>{control}</div>
    </div>
  );
}

/**
 * Settings, from the Claude Design file Settings.dc.html: row groups inside
 * 880px-wide cards, toggles, segmented controls, and a red destructive
 * action. Every control does something real - see lib/storage.ts (the
 * preferences), lib/api.ts (Share anonymous scam samples), lib/theme.ts
 * (Appearance) and lib/notifications.ts (the two notification toggles).
 */
export default function SettingsScreen() {
  const { lang, setLang } = useLanguage();
  const t = settingsCopy(lang);

  const [theme, setTheme] = useState<"light" | "dark">("dark");
  const [simple, setSimple] = useState(false);
  const [keepHistory, setKeepHistory] = useState(true);
  const [shareSamples, setShareSamples] = useState(true);
  const [alerts, setAlerts] = useState(false);
  const [practice, setPractice] = useState(false);
  const [permission, setPermission] = useState<NotifPermission>("default");
  const [deleteState, setDeleteState] = useState<"idle" | "confirm" | "done">("idle");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const c = loadTheme();
    setTheme(c === "light" ? "light" : c === "system" && !window.matchMedia("(prefers-color-scheme: dark)").matches ? "light" : "dark");
    setSimple(loadSimpleMode());
    setKeepHistory(loadKeepHistory());
    setShareSamples(loadShareSamples());
    setAlerts(loadScamAlerts().on);
    setPractice(loadPracticeReminder().on);
    setPermission(notificationSupport());
    setMounted(true);
  }, []);

  const pickTheme = (next: "light" | "dark") => {
    setTheme(next);
    saveTheme(next as ThemeChoice);
    applyTheme(next as ThemeChoice);
  };

  /** Shared by both notification toggles: request permission on the way on, never on the way off. */
  const setNotifToggle = async (
    next: boolean,
    setOn: (v: boolean) => void,
    save: (on: boolean) => void,
    syncTag: string,
  ) => {
    if (!next) {
      setOn(false);
      save(false);
      return;
    }
    let perm = notificationSupport();
    if (perm === "default") perm = await requestNotificationPermission();
    setPermission(perm);
    if (perm !== "granted") return; // blocked/unsupported note renders from `permission`
    setOn(true);
    save(true);
    void tryRegisterPeriodicSync(syncTag, 4 * 60 * 60 * 1000);
  };

  const langOptions = UI_LANGUAGES.map((l) => ({ id: l.id, label: l.label }));
  const themeOptions: { id: "light" | "dark"; label: string }[] = [
    { id: "light", label: t.appearance.light },
    { id: "dark", label: t.appearance.dark },
  ];

  const notifNote = permission === "denied" ? t.notif.blocked : permission === "unsupported" ? t.notif.unsupported : undefined;

  return (
    <DcPage label="Settings" maxWidth={880} gap={40}>
      <PageHeader title={t.title} />

      <Group label={t.groups.display}>
        <Row
          divider={false}
          title={t.language.label}
          desc={t.language.desc}
          control={<Seg options={langOptions} value={lang} onChange={(v) => setLang(v as UiLanguage)} label={t.language.label} />}
        />
        <Row
          title={t.appearance.label}
          desc={t.appearance.desc}
          control={<Seg options={themeOptions} value={theme} onChange={pickTheme} label={t.appearance.label} />}
        />
        <Row
          title={t.simple.label}
          desc={t.simple.desc}
          control={
            <Toggle
              on={mounted && simple}
              label={t.simple.label}
              onChange={(v) => {
                setSimple(v);
                saveSimpleMode(v);
              }}
            />
          }
        />
      </Group>

      <Group label={t.groups.privacy}>
        <Row
          divider={false}
          title={t.history.label}
          desc={t.history.desc}
          control={
            <Toggle
              on={mounted && keepHistory}
              label={t.history.label}
              onChange={(v) => {
                setKeepHistory(v);
                saveKeepHistory(v);
              }}
            />
          }
        />
        <Row
          title={t.share.label}
          desc={t.share.desc}
          control={
            <Toggle
              on={mounted && shareSamples}
              label={t.share.label}
              onChange={(v) => {
                setShareSamples(v);
                saveShareSamples(v);
              }}
            />
          }
        />
      </Group>

      <Group label={t.groups.alerts}>
        <Row
          divider={false}
          title={t.extension.label}
          desc={t.extension.desc}
          control={<Pill href="/extension" variant="outline" height={40}>{t.extension.cta}</Pill>}
        />
        <Row
          title={t.alerts.label}
          desc={t.alerts.desc}
          note={alerts ? undefined : notifNote}
          control={
            <Toggle
              on={mounted && alerts}
              label={t.alerts.label}
              onChange={(v) => void setNotifToggle(v, setAlerts, (on) => saveScamAlerts({ ...loadScamAlerts(), on }), "fraudlens-scam-alerts")}
            />
          }
        />
        <Row
          title={t.practice.label}
          desc={t.practice.desc}
          note={practice ? undefined : notifNote}
          control={
            <Toggle
              on={mounted && practice}
              label={t.practice.label}
              onChange={(v) =>
                void setNotifToggle(v, setPractice, (on) => savePracticeReminder({ ...loadPracticeReminder(), on }), "fraudlens-practice-reminder")
              }
            />
          }
        />
      </Group>

      <Group label={t.groups.about}>
        <Row divider={false} title={t.about.privacyLabel} desc="" control={<Pill href="/privacy" variant="outline" height={40}>→</Pill>} />
        <Row
          title={t.about.teamLabel}
          desc=""
          control={<Pill href="/created-by" variant="outline" height={40}>{t.about.teamCta}</Pill>}
        />
      </Group>

      <div style={{ display: "flex", flexDirection: "column", gap: 12, alignItems: "flex-start" }}>
        {deleteState !== "confirm" ? (
          <button
            type="button"
            onClick={() => setDeleteState("confirm")}
            style={{
              height: 48, padding: "0 22px", borderRadius: 999, border: "none", cursor: "pointer",
              background: "var(--dc-red-hl)", color: "var(--dc-red)", fontSize: 15, fontWeight: 600, fontFamily: "inherit",
            }}
          >
            {t.delete.button}
          </button>
        ) : (
          <div
            data-fx
            style={{
              ...card(24), borderColor: "var(--dc-red-hl)", padding: 24, display: "flex", flexDirection: "column", gap: 16, maxWidth: 520,
            }}
          >
            <span style={{ fontSize: 15, lineHeight: 1.5, color: "var(--dc-ink)" }}>{t.delete.confirm}</span>
            <div style={{ display: "flex", gap: 10 }}>
              <button
                type="button"
                onClick={() => {
                  clearCheckHistory();
                  setDeleteState("done");
                }}
                style={{ height: 44, padding: "0 20px", borderRadius: 999, border: "none", cursor: "pointer", background: "var(--dc-red-dot)", color: "#fff", fontSize: 14, fontWeight: 600, fontFamily: "inherit" }}
              >
                {t.delete.yes}
              </button>
              <button
                type="button"
                onClick={() => setDeleteState("idle")}
                style={{ height: 44, padding: "0 20px", borderRadius: 999, border: "1px solid var(--dc-line-strong)", cursor: "pointer", background: "transparent", color: "var(--dc-ink)", fontSize: 14, fontFamily: "inherit" }}
              >
                {t.delete.no}
              </button>
            </div>
          </div>
        )}
        {deleteState === "done" && (
          <span role="status" style={{ fontSize: 14, color: "var(--dc-green)" }}>{t.delete.done}</span>
        )}
      </div>

      <a href={REPO_URL} target="_blank" rel="noopener noreferrer" className="dc-link" style={{ fontSize: 13, color: "var(--dc-text4)" }}>
        {REPO_URL.replace(/^https:\/\//, "")}
      </a>
    </DcPage>
  );
}

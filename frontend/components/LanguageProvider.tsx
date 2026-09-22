"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { getCopy, UI_LANGUAGES, type Copy, type UiLanguage } from "@/lib/i18n";
import { loadLanguage, saveLanguage } from "@/lib/storage";

interface LanguageContextValue {
  lang: UiLanguage;
  copy: Copy;
  setLang: (lang: UiLanguage) => void;
  /** False until the saved choice has been read (the server render is always English). */
  ready: boolean;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

/**
 * Holds the chosen UI language. It drives both the on-screen copy and the
 * `language` hint sent to /api/analyze. Server render is always English;
 * a saved choice is applied after mount.
 */
export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<UiLanguage>("en");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const saved = loadLanguage();
    if (saved) setLangState(saved);
    setReady(true);
  }, []);

  useEffect(() => {
    document.documentElement.lang = UI_LANGUAGES.find((l) => l.id === lang)?.htmlLang ?? "en";
  }, [lang]);

  const setLang = useCallback((next: UiLanguage) => {
    setLangState(next);
    saveLanguage(next);
  }, []);

  return (
    <LanguageContext.Provider value={{ lang, copy: getCopy(lang), setLang, ready }}>{children}</LanguageContext.Provider>
  );
}

export function useLanguage(): LanguageContextValue {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error("useLanguage must be used inside <LanguageProvider>");
  return ctx;
}

/** Renders one string from the current language's copy. Lets server components place translated text. */
export function T({ k }: { k: { [K in keyof Copy]: Copy[K] extends string ? K : never }[keyof Copy] }) {
  const { copy } = useLanguage();
  return <>{copy[k]}</>;
}

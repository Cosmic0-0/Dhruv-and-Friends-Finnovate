import type { UiLanguage } from "@/lib/i18n";
import en from "./en.json";
import fr from "./fr.json";
import kreol from "./kreol.json";

/** Settings copy, one JSON file of text per UI language. */
export type SettingsCopy = typeof en;
const FILES: Record<UiLanguage, SettingsCopy> = { en, fr: fr as SettingsCopy, kreol: kreol as SettingsCopy };
export const settingsCopy = (lang: UiLanguage): SettingsCopy => FILES[lang] ?? en;

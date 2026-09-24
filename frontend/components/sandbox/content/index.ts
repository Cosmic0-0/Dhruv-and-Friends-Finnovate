import type { UiLanguage } from "@/lib/i18n";
import en from "./en.json";
import fr from "./fr.json";
import kreol from "./kreol.json";

/** Sandbox copy, one JSON file per UI language (Kreol is an unreviewed draft). */
export type SandboxCopy = typeof en;
const FILES: Record<UiLanguage, SandboxCopy> = { en, fr: fr as SandboxCopy, kreol: kreol as SandboxCopy };
export const sandboxCopy = (lang: UiLanguage): SandboxCopy => FILES[lang] ?? en;

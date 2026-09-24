import type { UiLanguage } from "@/lib/i18n";
import en from "./en.json";
import fr from "./fr.json";
import kreol from "./kreol.json";

/**
 * Report a scam copy. Each UI language is one plain JSON file of text in this
 * folder; the screen picks the file for the selected language. All three are
 * bundled, so every language renders statically and works offline.
 *
 * Contact numbers and addresses are not copy: they live in ../contacts.ts.
 */

export type LevelN = 1 | 2 | 3 | 4;
/** Which contact a step's buttons point at (see ../contacts.ts). */
export type ActionSet = "cert" | "ccu" | "emergency" | "none";
export type StepCopy = { who: string; what: string; actions: ActionSet };
export type LevelCopy = { urgency: string; title: string; sub: string; headline: string; steps: StepCopy[] };
export type ContactId = "cert" | "ccu" | "emergency" | "bank" | "dpo" | "fsc";

export type ReportCopy = {
  eyebrow: string;
  title: string;
  lede: string;
  danger: string;
  whatHappened: string;
  level: string;
  levels: Record<`${LevelN}`, LevelCopy>;
  matrixTitle: string;
  matrixSub: string;
  contactFirst: string;
  alsoReport: string;
  notNeeded: string;
  situation: string;
  /** Column headers, in the order of ORG columns in ../contacts.ts. */
  orgs: string[];
  /** Row labels, in the order of MATRIX rows in ../contacts.ts. */
  situations: string[];
  contactsTitle: string;
  contactNames: Record<ContactId, string>;
  contactFor: Record<ContactId, string>;
  bankLine: string;
  emergencyLine: string;
  beforeTitle: string;
  beforeBody: string;
  checklist: string[];
  sourceNote: string;
  /** `call` contains a `{n}` placeholder for the number. */
  actions: { maucors: string; call: string };
};

const FILES: Record<UiLanguage, ReportCopy> = {
  en: en as ReportCopy,
  fr: fr as ReportCopy,
  kreol: kreol as ReportCopy,
};

export function reportCopy(lang: UiLanguage): ReportCopy {
  return FILES[lang] ?? FILES.en;
}

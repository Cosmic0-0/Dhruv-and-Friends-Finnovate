/**
 * The single place that maps a verdict to how it is shown: label, colour
 * tokens, icon and headline copy. Screens must read from here rather than
 * hardcoding verdict strings or colours.
 */

import type { UiLanguage } from "./i18n";
import type { AnalyzeResponse, Verdict } from "./types";

export type VerdictTone = "danger" | "caution" | "safe";

export interface VerdictDisplay {
  verdict: Verdict;
  /** Band label, e.g. "Likely a scam". Always shown. */
  label: string;
  /** Supporting line under the label. */
  headline: string;
  tone: VerdictTone;
  /** Strong colour (banner fill, icon), as a CSS var from globals.css. */
  color: string;
  /** Soft tint for backgrounds. */
  softColor: string;
  /** Tailwind classes for the same tokens, for className use. */
  classes: { text: string; bg: string; softBg: string; border: string };
  /** Icon name plus inline SVG path data (24x24 viewBox, stroke-based), so there's no icon-library dependency. */
  icon: { name: "alert-triangle" | "alert-circle" | "check-circle"; paths: readonly string[] };
}

export const VERDICT_DISPLAY: Record<Verdict, VerdictDisplay> = {
  scam: {
    verdict: "scam",
    label: "Likely a scam",
    headline: "Don't pay, reply or tap any links in this message.",
    tone: "danger",
    color: "var(--color-danger)",
    softColor: "var(--color-danger-soft)",
    classes: { text: "text-danger", bg: "bg-danger", softBg: "bg-danger-soft", border: "border-danger" },
    icon: {
      name: "alert-triangle",
      paths: [
        "M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z",
        "M12 9v4",
        "M12 17h.01",
      ],
    },
  },
  suspicious: {
    verdict: "suspicious",
    label: "Be careful",
    headline: "Some things here don't add up. Check before you act.",
    tone: "caution",
    color: "var(--color-caution)",
    softColor: "var(--color-caution-soft)",
    classes: { text: "text-caution", bg: "bg-caution", softBg: "bg-caution-soft", border: "border-caution" },
    icon: {
      name: "alert-circle",
      paths: ["M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z", "M12 8v4.5", "M12 16h.01"],
    },
  },
  safe: {
    verdict: "safe",
    label: "Looks genuine",
    headline: "We found no warning signs. If money is involved, still confirm through an official channel.",
    tone: "safe",
    color: "var(--color-safe)",
    softColor: "var(--color-safe-soft)",
    classes: { text: "text-safe", bg: "bg-safe", softBg: "bg-safe-soft", border: "border-safe" },
    icon: {
      name: "check-circle",
      paths: ["M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z", "m8.5 12.5 2.5 2.5 4.5-5"],
    },
  },
};

export function getVerdictDisplay(verdict: Verdict): VerdictDisplay {
  return VERDICT_DISPLAY[verdict];
}

export type RiskDisplay = { showScore: false } | { showScore: true; score: number };

/**
 * Whether to show a numeric score and meter. Only a backend-supplied
 * `riskScore` in 0–100 is ever shown. If it's absent or out of range, the UI
 * shows the band label alone: no number, no meter.
 *
 * Never derive a score client-side from the signals. A made-up number is
 * worse than no number.
 */
export function getRiskDisplay(res: Pick<AnalyzeResponse, "riskScore">): RiskDisplay {
  const { riskScore } = res;
  if (typeof riskScore !== "number" || !Number.isFinite(riskScore) || riskScore < 0 || riskScore > 100) {
    return { showScore: false };
  }
  return { showScore: true, score: Math.round(riskScore) };
}

/**
 * Localized label + headline. English matches VERDICT_DISPLAY exactly; the
 * Kreol strings need a review by the Kreol language owner before the demo.
 */
const VERDICT_COPY: Record<Verdict, Record<UiLanguage, { label: string; headline: string }>> = {
  scam: {
    en: { label: VERDICT_DISPLAY.scam.label, headline: VERDICT_DISPLAY.scam.headline },
    fr: { label: "Probablement une arnaque", headline: "Ne payez pas, ne répondez pas et n'ouvrez aucun lien de ce message." },
    kreol: { label: "Paret enn eskrokri", headline: "Pa pey, pa reponn ek pa klik okenn lien dan sa mesaz la." },
  },
  suspicious: {
    en: { label: VERDICT_DISPLAY.suspicious.label, headline: VERDICT_DISPLAY.suspicious.headline },
    fr: { label: "Soyez prudent", headline: "Certains éléments ne collent pas. Vérifiez avant d'agir." },
    kreol: { label: "Fer atansion", headline: "Ena kiksoz ki pa kole. Verifie avan ou fer nanye." },
  },
  safe: {
    en: { label: VERDICT_DISPLAY.safe.label, headline: VERDICT_DISPLAY.safe.headline },
    fr: {
      label: "Semble authentique",
      headline: "Aucun signal d'alerte trouvé. S'il y a de l'argent en jeu, confirmez quand même par un canal officiel.",
    },
    kreol: {
      label: "Paret bon",
      headline: "Nou pa finn trouv okenn siny danze. Si ena larzan ladan, konfirm kan mem par enn kanal ofisiel.",
    },
  },
};

export function getVerdictCopy(verdict: Verdict, lang: UiLanguage): { label: string; headline: string } {
  return VERDICT_COPY[verdict][lang];
}

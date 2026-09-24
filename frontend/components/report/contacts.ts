import type { ActionSet, ContactId, LevelN, ReportCopy } from "./content";

/**
 * Official Mauritian reporting channels. Fixed reference data: nothing here is
 * fetched or generated at runtime. Verified September 2026 against:
 *   CERT-MU contact page and MAUCORS contact page (hotline, incident email, DPO),
 *   Mauritius Police Force contact page (999 / 112) and its May 2026 cybercrime
 *   leaflet (Cybercrime Unit 210 4653 / 210 5384, ccu.mpf@govmu.org),
 *   FSC communiqué: since 16 March 2026 complaints, including unlicensed
 *   schemes, are accepted only through complaints.fscmauritius.org.
 * Wording is in ./content; only numbers, addresses and links live here, so
 * they are the same in every language.
 */

export type Action = { label: string; href: string };

export const TONE_OF: Record<LevelN, "green" | "amber" | "red"> = { 1: "green", 2: "amber", 3: "red", 4: "red" };

export function actionsFor(set: ActionSet, t: ReportCopy): Action[] {
  const call = (n: string) => t.actions.call.replace("{n}", n);
  switch (set) {
    case "cert":
      return [
        { label: t.actions.maucors, href: "https://maucors.govmu.org" },
        { label: call("800 2378"), href: "tel:8002378" },
      ];
    case "ccu":
      return [
        { label: call("210 4653"), href: "tel:2104653" },
        { label: "ccu.mpf@govmu.org", href: "mailto:ccu.mpf@govmu.org" },
      ];
    case "emergency":
      return [
        { label: call("999"), href: "tel:999" },
        { label: call("112"), href: "tel:112" },
      ];
    default:
      return [];
  }
}

/** Matrix columns: bank, police 999, cybercrime unit, CERT-MU, FSC, data protection. */
// 2 = contact first, 1 = also report, 0 = not needed. Row order matches `situations` in the copy.
export const MATRIX: [LevelN, number[]][] = [
  [1, [0, 0, 0, 2, 0, 0]],
  [2, [2, 0, 0, 1, 0, 0]],
  [3, [2, 0, 1, 1, 0, 0]],
  [3, [2, 0, 1, 1, 1, 0]],
  [3, [0, 0, 1, 1, 0, 2]],
  [4, [0, 1, 2, 1, 0, 0]],
  [4, [0, 2, 1, 0, 0, 0]],
];

/** Contact cards. A line with an empty href is plain text (no link to follow). */
export function directory(t: ReportCopy): { id: ContactId; lines: [string, string][] }[] {
  return [
    { id: "cert", lines: [["Hotline 800 2378", "tel:8002378"], ["incident@cert.govmu.org", "mailto:incident@cert.govmu.org"], ["maucors.govmu.org", "https://maucors.govmu.org"]] },
    { id: "ccu", lines: [["210 4653 / 210 5384", "tel:2104653"], ["ccu.mpf@govmu.org", "mailto:ccu.mpf@govmu.org"]] },
    { id: "emergency", lines: [[t.emergencyLine, "tel:999"]] },
    { id: "bank", lines: [[t.bankLine, ""]] },
    { id: "dpo", lines: [["460 0251", "tel:4600251"], ["dpo@govmu.org", "mailto:dpo@govmu.org"]] },
    { id: "fsc", lines: [["complaints.fscmauritius.org", "https://complaints.fscmauritius.org"]] },
  ];
}

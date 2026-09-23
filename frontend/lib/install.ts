/**
 * "Add to Home Screen" support, kept deliberately small.
 *
 * Two different platforms, two different truths:
 *  - Chrome/Android fires `beforeinstallprompt`, which can be saved and
 *    replayed from a tap to show the real install dialog.
 *  - iOS Safari has no such event and no API to trigger an install at all, so
 *    the only honest thing to offer there is the manual steps.
 *
 * Everything here is guarded: this runs in a PWA that has to work with storage
 * blocked, and none of it may ever throw into the render path.
 */

const DISMISSED_KEY = "fraudlens.installDismissed.v1";

/** The slice of BeforeInstallPromptEvent actually used; it is not in lib.dom. */
export interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

/** True when the app is already running installed, where the card is pointless. */
export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  try {
    // `standalone` is the iOS Safari flag; the media query covers everyone else.
    const iosInstalled = (window.navigator as { standalone?: boolean }).standalone === true;
    return iosInstalled || window.matchMedia("(display-mode: standalone)").matches;
  } catch {
    return false;
  }
}

/** iOS has no install API, so the card offers steps instead of a button. */
export function isIos(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  // iPadOS 13+ reports as a Mac, distinguishable only by touch support.
  return /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
}

export function wasDismissed(): boolean {
  try {
    return window.localStorage.getItem(DISMISSED_KEY) === "1";
  } catch {
    return false;
  }
}

export function dismiss(): void {
  try {
    window.localStorage.setItem(DISMISSED_KEY, "1");
  } catch {
    /* storage unavailable: the card comes back next visit, which is harmless */
  }
}

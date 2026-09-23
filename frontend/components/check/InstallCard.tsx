"use client";

import { useEffect, useState } from "react";
import type { Copy } from "@/lib/i18n";
import { dismiss, isIos, isStandalone, wasDismissed, type InstallPromptEvent } from "@/lib/install";
import { ShareIcon } from "../icons";

/**
 * The "Add to Home Screen" suggestion card (frontend/design/mockup/Main.html).
 *
 * Hidden when the app is already installed, when the user has said "Not now",
 * and on any browser that offers neither a real install prompt nor the iOS
 * steps — so it never suggests something that cannot be done.
 *
 * On Chrome/Android the saved `beforeinstallprompt` event shows the real
 * dialog. iOS has no install API at all, so the button reveals the two manual
 * steps instead of pretending to do it.
 */
export default function InstallCard({ copy }: { copy: Copy }) {
  const c = copy.check.install;
  const [prompt, setPrompt] = useState<InstallPromptEvent | null>(null);
  const [ios, setIos] = useState(false);
  const [showSteps, setShowSteps] = useState(false);
  // null until mounted: none of this can be known during server render.
  const [hidden, setHidden] = useState<boolean | null>(null);

  useEffect(() => {
    if (isStandalone() || wasDismissed()) {
      setHidden(true);
      return;
    }
    setIos(isIos());
    setHidden(false);

    const onPrompt = (e: Event) => {
      // Keep the event so the install dialog can be opened from a real tap.
      e.preventDefault();
      setPrompt(e as InstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    // Installed from elsewhere (browser menu): the card has nothing left to offer.
    const onInstalled = () => setHidden(true);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  // Nothing to offer: no prompt captured and not an iOS browser.
  if (hidden !== false || (!prompt && !ios)) return null;

  const add = async () => {
    if (ios || !prompt) {
      setShowSteps(true);
      return;
    }
    try {
      await prompt.prompt();
      const { outcome } = await prompt.userChoice;
      if (outcome === "accepted") setHidden(true);
    } catch {
      // The event can only be used once; fall back to the manual steps.
      setShowSteps(true);
    }
    setPrompt(null);
  };

  const notNow = () => {
    dismiss();
    setHidden(true);
  };

  return (
    <section className="suggestion flex flex-col gap-3.5 px-5 py-[18px]">
      <p className="text-[1.0625rem] leading-[1.4375rem] text-ink">{c.body}</p>

      {showSteps ? (
        <div className="flex flex-col gap-2">
          <p className="micro text-ink">{c.iosTitle}</p>
          <p className="flex items-center gap-2 text-[0.9375rem] text-ink-soft">
            <ShareIcon className="size-[18px] shrink-0" />
            {c.iosStep1}
          </p>
          <p className="text-[0.9375rem] text-ink-soft">{c.iosStep2}</p>
          <button type="button" onClick={notNow} className="btn-sm pressable mt-1 w-fit bg-black/[0.06] text-ink-muted">
            {c.notNow}
          </button>
        </div>
      ) : (
        <div className="flex gap-2.5">
          <button type="button" onClick={() => void add()} className="btn-sm pressable bg-primary text-on-primary">
            {c.add}
          </button>
          <button type="button" onClick={notNow} className="btn-sm pressable bg-black/[0.06] font-medium text-ink-muted">
            {c.notNow}
          </button>
        </div>
      )}
    </section>
  );
}

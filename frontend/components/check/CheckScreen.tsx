"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { DcPage } from "../dc";
import { useLanguage } from "../LanguageProvider";
import { checkCopy } from "./content";
import Hub from "./Hub";
import Workspace from "./Workspace";
import { takePendingCheck } from "@/lib/handoff";
import { MAX_MESSAGE_LENGTH } from "@/lib/types";

type View = "hub" | "workspace";

/**
 * The Check hub + workspace (Claude Design Check.dc.html), in one page: the
 * hub is the entry point, "Check message" / "Try it with a real MCB scam"
 * switches to the workspace with a real check already in flight. Handles the
 * extension's `?scan=` hand-off (prefill only, never auto-submit) and the tab
 * bar's `?new=1` (open the workspace ready to type).
 */
export default function CheckScreen() {
  const searchParams = useSearchParams();
  const { lang } = useLanguage();
  const t = checkCopy(lang);

  // Read once, synchronously, from the URL present at first render. A
  // router.replace() here would re-run this client segment (it reads
  // useSearchParams) and can remount this component before the effect-based
  // version fires, silently dropping the hand-off — so the query string is
  // stripped with the plain history API instead, which never triggers a
  // Next navigation.
  const [view, setView] = useState<View>(() => (searchParams.get("scan") || searchParams.get("new") ? "workspace" : "hub"));
  const [initialText, setInitialText] = useState(() => searchParams.get("scan")?.slice(0, MAX_MESSAGE_LENGTH) ?? "");
  const [autoSubmit, setAutoSubmit] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (searchParams.get("scan") || searchParams.get("new")) {
      window.history.replaceState(null, "", "/app");
      return;
    }
    // A message typed on the landing hero (lib/handoff.ts): check it straight away.
    const pending = takePendingCheck();
    if (pending) start(pending.slice(0, MAX_MESSAGE_LENGTH), true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function start(text: string, fire = false) {
    setInitialText(text);
    setAutoSubmit(fire ? text : undefined);
    setView("workspace");
  }

  return (
    <DcPage label="check" padding="80px 48px 120px" gap={64}>
      {view === "hub" ? (
        <Hub t={t} onStart={start} />
      ) : (
        <Workspace
          t={t}
          initialText={initialText}
          autoSubmit={autoSubmit}
          onBack={() => {
            setView("hub");
            setAutoSubmit(undefined);
          }}
        />
      )}
    </DcPage>
  );
}

"use client";

import { useEffect } from "react";
import { startNotificationSchedules } from "@/lib/notifications";

/**
 * Registers /sw.js for offline app-shell loading. Production only: in
 * `next dev` a caching service worker serves stale bundles and fights HMR.
 *
 * Also starts the Settings > "Scam alerts" / "Daily practice reminder"
 * foreground poll (lib/notifications.ts), which does not need the service
 * worker: it runs in every environment, and is a no-op when both toggles
 * are off. This is the one place mounted on every page (via app/layout.tsx),
 * so it is where an app-wide background check belongs.
 */
export default function ServiceWorkerRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV === "production" && "serviceWorker" in navigator) {
      const register = () => {
        navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch((err) => {
          console.warn("[sw] registration failed", err);
        });
      };

      if (document.readyState === "complete") register();
      else window.addEventListener("load", register, { once: true });
    }

    return startNotificationSchedules();
  }, []);

  return null;
}

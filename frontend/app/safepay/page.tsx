import AppHeader from "@/components/AppHeader";
import SafePayFlow from "@/components/SafePayFlow";

/**
 * "I'm about to pay" — a separate entry point from the Check screen
 * (app/page.tsx), for a payment request the user hasn't sent yet rather
 * than a message they've already received. Reuses the exact same
 * /api/analyze pipeline and result components (components/result/) as the
 * Check flow - see components/SafePayFlow.tsx for how the form maps to one
 * message for that pipeline.
 *
 * The title lives inside SafePayFlow (a client component) rather than here:
 * it needs `copy.safepay.title`, a nested Copy key the server-render-
 * friendly <T> helper can't reach (T only covers top-level string keys).
 */
export default function SafePayPage() {
  return (
    <main>
      <AppHeader />
      <SafePayFlow />
    </main>
  );
}

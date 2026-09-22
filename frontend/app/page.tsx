import AppHeader from "@/components/AppHeader";
import CheckForm from "@/components/CheckForm";
import RecentChecks from "@/components/RecentChecks";
import { T } from "@/components/LanguageProvider";
import { SendIcon } from "@/components/icons";

// Server component: only the pieces that need state (language switch, form,
// recent checks) are client components.
export default function CheckPage() {
  return (
    <main className="flex flex-col gap-8">
      <AppHeader />

      <section className="flex flex-col gap-3 pt-2">
        <h1>
          <T k="headline" />
        </h1>
        <p className="text-[1.0625rem] leading-relaxed text-ink-soft">
          <T k="subline" />
        </p>
      </section>

      <CheckForm />

      <p className="flex items-center gap-3 rounded-card bg-muted-surface px-4 py-3 text-sm text-ink-soft">
        <SendIcon className="size-4 shrink-0 text-ink-muted" />
        <span>
          <T k="telegram" />
        </span>
      </p>

      <RecentChecks />
    </main>
  );
}

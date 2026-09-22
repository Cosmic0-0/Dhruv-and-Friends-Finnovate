import Link from "next/link";
import AppHeader from "@/components/AppHeader";

export default function NotFound() {
  return (
    <main className="flex flex-col gap-8">
      <AppHeader />
      <section className="flex flex-col items-start gap-3 pt-2">
        <h1>Page not found</h1>
        <p className="text-[1.0625rem] leading-relaxed text-ink-soft">
          That page doesn&apos;t exist. Check a message instead.
        </p>
        <Link href="/" className="rounded-card bg-ink px-4 py-2 text-on-ink">
          Back to FraudLens
        </Link>
      </section>
    </main>
  );
}

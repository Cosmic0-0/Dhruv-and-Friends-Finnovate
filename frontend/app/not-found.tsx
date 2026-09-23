import Link from "next/link";

export default function NotFound() {
  return (
    <main>
      <section className="gutter flex flex-col items-start gap-4 pt-7">
        <p className="data text-ink-muted">404</p>
        <h1>Page not found</h1>
        <p className="text-[1.0625rem] leading-relaxed text-ink-soft">
          That page doesn&apos;t exist. Check a message instead.
        </p>
        <Link
          href="/"
          className="pressable micro mt-1 flex min-h-12 items-center bg-surface-dark px-5 text-on-ink hover:bg-surface-dark-2"
        >
          Back to FraudLens
        </Link>
      </section>
    </main>
  );
}

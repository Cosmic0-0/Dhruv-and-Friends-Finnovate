import Link from "next/link";

export default function NotFound() {
  return (
    <main>
      <section
        className="gutter flex flex-col items-start gap-3"
        style={{ paddingTop: "calc(60px + env(safe-area-inset-top))" }}
      >
        <p className="data text-ink-muted">404</p>
        <h1>Page not found</h1>
        <p className="text-[1.0625rem] leading-[1.4375rem] text-ink-soft">
          That page doesn&apos;t exist. Check a message instead.
        </p>
        <Link href="/" className="pill pressable mt-2 bg-primary text-on-primary">
          Back to FraudLens
        </Link>
      </section>
    </main>
  );
}

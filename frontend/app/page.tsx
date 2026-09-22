export default function HomePage() {
  return (
    <main className="flex flex-col gap-section pt-8">
      <header className="flex flex-col gap-3">
        <p className="text-sm font-medium tracking-wide text-ink-muted uppercase">FraudLens AI</p>
        <h1>Check a message before you pay.</h1>
      </header>
      {/* Message input + verdict display goes here (frontend owner, see CLAUDE.md). */}
    </main>
  );
}

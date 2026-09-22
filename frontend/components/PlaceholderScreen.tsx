"use client";

import { useLanguage } from "./LanguageProvider";

export default function PlaceholderScreen({ page }: { page: "learn" | "trends" }) {
  const { copy } = useLanguage();
  return (
    <section className="flex flex-col gap-3">
      <h1 className="text-title">{page === "learn" ? copy.placeholderPage.learnTitle : copy.placeholderPage.trendsTitle}</h1>
      <p className="text-ink-muted">{copy.placeholderPage.body}</p>
    </section>
  );
}

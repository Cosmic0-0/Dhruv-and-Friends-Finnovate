"use client";

import Link from "next/link";
import { useLanguage } from "./LanguageProvider";
import { ShieldIcon, BookIcon, SearchIcon } from "./icons";

const EN = {
  eyebrow: "Your investigation workspace", title: "One message is only the beginning.",
  tools: [
    { title: "Before you pay", body: "Check the warning signs before money changes hands.", action: "Open SafePay" },
    { title: "Follow the conversation", body: "See how pressure builds, one message at a time.", action: "Start a conversation" },
    { title: "Recognise the playbook", body: "Practise spotting tactics in a guided scam simulation.", action: "Enter the sandbox" },
  ],
};
const FR: typeof EN = {
  eyebrow: "Votre espace d'investigation", title: "Un message n'est que le début.",
  tools: [
    { title: "Avant de payer", body: "Vérifiez les signaux d'alerte avant de transférer de l'argent.", action: "Ouvrir SafePay" },
    { title: "Suivez la conversation", body: "Observez la pression monter, message après message.", action: "Commencer une conversation" },
    { title: "Repérez les tactiques", body: "Entraînez-vous avec une simulation d'arnaque guidée.", action: "Lancer la simulation" },
  ],
};
const TODO_KREOL = <T,>(value: T): T => value;
const routes = ["/safepay", "/conversation", "/sandbox"];
const icons = [ShieldIcon, SearchIcon, BookIcon];

export default function IntelligenceTools() {
  const { lang } = useLanguage();
  const c = lang === "fr" ? FR : lang === "kreol" ? TODO_KREOL(EN) : EN;
  return (
    <section aria-labelledby="tools-title" className="pb-4">
      <div className="mb-5 border-t border-line-strong pt-6">
        <p className="micro mb-3 text-accent-ink">{c.eyebrow}</p>
        <h2 id="tools-title" className="text-title">{c.title}</h2>
      </div>
      <div className="grid gap-px border border-card-border bg-card-border md:grid-cols-3">
        {c.tools.map((tool, index) => {
          const Icon = icons[index];
          return <Link key={routes[index]} href={routes[index]} className="tool-link group flex flex-col bg-card p-5 focus-visible:relative">
            <div className="mb-7 flex items-center justify-between"><Icon className="size-5 text-accent-ink" /><span className="data text-ink-muted">0{index + 1}</span></div>
            <h3 className="mb-2 text-[1.25rem]">{tool.title}</h3>
            <p className="mb-6 text-sm leading-relaxed text-ink-soft">{tool.body}</p>
            <span className="mt-auto flex items-center justify-between gap-2 text-sm font-medium text-accent-ink">{tool.action}<span aria-hidden="true" className="transition-transform group-hover:translate-x-1">↗</span></span>
          </Link>;
        })}
      </div>
    </section>
  );
}

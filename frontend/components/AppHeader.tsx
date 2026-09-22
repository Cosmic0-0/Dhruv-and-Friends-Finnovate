import Link from "next/link";
import LanguageSwitch from "./LanguageSwitch";
import { ShieldIcon } from "./icons";

export default function AppHeader() {
  return (
    <header className="flex items-center justify-between gap-4">
      <Link href="/" className="flex items-center gap-2 text-ink" aria-label="FraudLens home">
        <span className="grid size-8 place-items-center rounded-[10px] bg-ink text-on-ink">
          <ShieldIcon className="size-[18px]" strokeWidth={2} />
        </span>
        <span className="font-serif text-[1.3125rem] font-medium tracking-[-0.01em]">FraudLens</span>
      </Link>
      <LanguageSwitch />
    </header>
  );
}

import Link from "next/link";
import { TEAM_NAME, HACKATHON, REPO_URL } from "@/lib/team";
import { GitHubIcon } from "@/components/landing/TeamSection";

export default function LandingFooter() {
  return (
    <footer className="landing-footer">
      <div className="landing-footer-bg" aria-hidden="true" />
      <div className="landing-footer-inner">
        <Link href="/" aria-label="FraudLens home" className="landing-footer-brand">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/dhruv-and-friends.png" alt={`${TEAM_NAME} logo`} width={72} height={72} className="landing-footer-logo" />
          <div>
            <p className="landing-footer-name">FraudLens AI</p>
            <p className="landing-footer-by">
              by {TEAM_NAME} · {HACKATHON}
            </p>
          </div>
        </Link>

        <nav className="landing-footer-links" aria-label="Project">
          <Link href="/app">Web app</Link>
          <a href="#get-it">Chrome extension</a>
          <a href="#get-it">Outlook add-in</a>
          <a href="/link-guard-privacy.html">Privacy</a>
          <a href={REPO_URL} target="_blank" rel="noopener noreferrer" className="landing-footer-gh">
            <GitHubIcon className="size-4" />
            Source
          </a>
        </nav>

        <p className="landing-footer-fine">
          FraudLens flags warning signs; it can't promise a message is safe. If in doubt, call your bank on the number on your
          card.
        </p>
      </div>
    </footer>
  );
}

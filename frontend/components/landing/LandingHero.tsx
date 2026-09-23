import Link from "next/link";
import { TEAM_NAME } from "@/lib/team";

const NAV = [
  { href: "#problem", label: "The problem" },
  { href: "#approach", label: "How it works" },
  { href: "#get-it", label: "Get it" },
  { href: "#team", label: "Team" },
];

/**
 * FraudLens reading a typical Kreol bank SMS, drawn in HTML. The verdict and
 * score are what the deterministic pipeline returns for this exact text
 * (scam, 85: URL-02, ID-01, SEC-01, SOC-02, URL-08), without the AI model.
 */
function VerdictPreview() {
  return (
    <figure className="landing-preview" aria-label="Example: FraudLens reading a scam SMS">
      <div className="landing-preview-sms">
        <p className="landing-preview-from">MCB-Alert · SMS</p>
        <p className="landing-preview-text">
          Ou kont MCB <mark data-tone="threat">pou bloke zordi</mark>. <mark data-tone="ask">Konfirm ou OTP</mark> lor{" "}
          <mark data-tone="link">mcb-secure.top/verify</mark>
        </p>
      </div>
      <div className="landing-preview-verdict">
        <div className="landing-preview-head">
          <span className="landing-preview-badge">Scam</span>
          <span className="landing-preview-score">
            <strong>85</strong> / 100 risk
          </span>
        </div>
        <ul className="landing-preview-reasons">
          <li data-tone="link">
            <span>
              <strong>mcb-secure.top</strong> is not MCB. The real site is mcb.mu.
            </span>
          </li>
          <li data-tone="ask">
            <span>Asks for your one-time code. MCB never does.</span>
          </li>
          <li data-tone="threat">
            <span>Threatens to block the account today.</span>
          </li>
        </ul>
        <p className="landing-preview-plan">Don't reply. Call MCB on the number on your card.</p>
      </div>
      <figcaption className="visually-hidden">
        FraudLens flags the lookalike link, the request for an OTP and the threat, and says what to do next.
      </figcaption>
    </figure>
  );
}

export default function LandingHero() {
  return (
    <header className="landing-hero">
      <div className="landing-hero-bg" aria-hidden="true" />
      <nav className="landing-nav" aria-label="Landing page">
        <Link href="/" className="landing-brand">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/dhruv-and-friends.png" alt="" width={36} height={36} className="landing-brand-mark" />
          <span>
            FraudLens AI <span className="landing-brand-by">by {TEAM_NAME}</span>
          </span>
        </Link>
        <ul className="landing-nav-links">
          {NAV.map((item) => (
            <li key={item.href}>
              <a href={item.href}>{item.label}</a>
            </li>
          ))}
        </ul>
        <Link href="/app" className="landing-nav-cta">
          Open the app
        </Link>
      </nav>

      <div className="landing-hero-grid">
        <div className="landing-hero-copy">
          <h1 className="landing-hero-title">
            Catch the scam <br />
            before you pay.
          </h1>
          <p className="landing-hero-lede">
            FraudLens reads the suspicious SMS, the link, the website and the invoice email, and shows you exactly which
            words and addresses give the scam away. Every verdict comes with its evidence, and a plan for what to do next.
          </p>
          <div className="landing-hero-actions">
            <Link href="/app" className="landing-btn landing-btn-primary">
              Check a message
            </Link>
            <a href="#get-it" className="landing-btn landing-btn-ghost">
              Get the extension and Outlook add-in
            </a>
          </div>
          <p className="landing-hero-note">Built for Mauritius. Reads English, French and Kreol Morisien.</p>
        </div>
        <VerdictPreview />
      </div>
    </header>
  );
}

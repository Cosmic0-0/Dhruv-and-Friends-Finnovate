import Link from "next/link";
import {
  CheckIcon,
  DocumentIcon,
  ImageIcon,
  LayersIcon,
  LinkIcon,
  SearchIcon,
  ShieldIcon,
  TrendIcon,
  WarningIcon,
  XIcon,
} from "@/components/icons";
import { REPO_URL } from "@/lib/team";

function SectionHead({ id, title, lede }: { id: string; title: string; lede: string }) {
  return (
    <div className="landing-section-head">
      <h2 id={id} className="landing-h2">
        {title}
      </h2>
      <p className="landing-lede">{lede}</p>
    </div>
  );
}

// ---------------------------------------------------------------- Problem

const SCAMS = [
  {
    channel: "SMS",
    quote: "Ou kont MCB pou bloke zordi. Konfirm ou OTP lor mcb-secure.top",
    tell: "A lookalike bank domain, a threat and a request for your code, in Kreol.",
  },
  {
    channel: "Web page",
    quote: "MRA: you are eligible for a tax refund of Rs 4,850. Enter your card to receive it.",
    tell: "A fake government refund that only needs your card number.",
  },
  {
    channel: "Work email",
    quote: "Please note our bank details have recently been updated. Kindly settle the attached invoice today.",
    tell: "A supplier domain with one letter changed, and new bank details.",
  },
];

export function ProblemSection() {
  return (
    <section className="landing-section" aria-labelledby="problem-heading" id="problem">
      <SectionHead
        id="problem-heading"
        title="Phishing here doesn't look like phishing anywhere else"
        lede="Scam messages in Mauritius switch between Kreol, French and English in one sentence, borrow the names of local banks and ministries, and link to addresses one letter away from the real thing. Generic filters don't read Kreol, don't know mcb.mu from mcb.nu, and answer with a score nobody can explain. So people check scams the only way they can: by asking someone they trust, often after they've already clicked."
      />
      <div className="landing-scams">
        {SCAMS.map((scam) => (
          <figure key={scam.channel} className="landing-scam">
            <p className="landing-scam-channel">{scam.channel}</p>
            <blockquote className="landing-scam-quote">{scam.quote}</blockquote>
            <figcaption className="landing-scam-tell">
              <WarningIcon className="landing-inline-icon" />
              {scam.tell}
            </figcaption>
          </figure>
        ))}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------- Approach

const PRONGS = [
  {
    name: "The web app",
    where: "Messages you receive",
    Icon: SearchIcon,
    body: "Paste an SMS or WhatsApp message, drop a screenshot, or upload a PDF or Word document. FraudLens highlights the exact words and links that give it away, and gives you a short plan for what to do next.",
    extras: ["Screenshot OCR", "Before You Pay", "Document forensics", "Scam practice sandbox"],
  },
  {
    name: "The Chrome extension",
    where: "Sites you open",
    Icon: ShieldIcon,
    body: "Checks every site you visit against the Mauritius institution registry, lookalike rules, phishing and malware lists, domain age and the site's certificate. The Security Report grades a site and tells a badly built one from a hostile one.",
    extras: ["Lookalike domains", "Certificate identity", "Login-form checks", "Line-of-code findings"],
  },
  {
    name: "The Outlook add-in",
    where: "Email at work",
    Icon: DocumentIcon,
    body: "Runs inside the email a business receives and looks for invoice and CEO fraud: supplier lookalike domains, changed bank details, a Reply-To that doesn't match, and payment requests from personal addresses.",
    extras: ["Supplier lookalikes", "Bank-detail changes", "Reply-To mismatch", "CEO fraud"],
  },
];

export function ApproachSection() {
  return (
    <section className="landing-section" aria-labelledby="approach-heading" id="approach">
      <SectionHead
        id="approach-heading"
        title="Three ways in, one engine"
        lede="Scams reach people in three places, so FraudLens meets them in all three. Every client calls the same backend; none of them carries its own copy of the detection logic, so a rule fixed once is fixed everywhere."
      />
      <div className="landing-prongs">
        {PRONGS.map(({ name, where, Icon, body, extras }) => (
          <article key={name} className="landing-prong">
            <div className="landing-prong-top">
              <span className="landing-prong-icon">
                <Icon className="size-6" />
              </span>
              <p className="landing-prong-where">{where}</p>
            </div>
            <h3 className="landing-h3">{name}</h3>
            <p className="landing-body">{body}</p>
            <ul className="landing-tags">
              {extras.map((extra) => (
                <li key={extra}>{extra}</li>
              ))}
            </ul>
          </article>
        ))}
      </div>
      <div className="landing-engine" aria-label="How a verdict is made">
        <div className="landing-engine-step">
          <span className="landing-engine-num">Language</span>
          <p>
            An AI model reads the message for tactics like urgency, threats or a request for an OTP. It must quote the exact
            words, and any quote not in the message is thrown out.
          </p>
        </div>
        <div className="landing-engine-step">
          <span className="landing-engine-num">Facts</span>
          <p>
            Deterministic code checks the links, domains, claimed identity, payment details, certificates and threat lists.
            Nothing here is guessed.
          </p>
        </div>
        <div className="landing-engine-step">
          <span className="landing-engine-num">Verdict</span>
          <p>
            A versioned rule engine turns both into a score, a verdict and an action plan. The same message always gets the
            same answer, and it still works when the AI is down.
          </p>
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------- Candid break

export function CandidBreak() {
  return (
    <figure className="landing-candid">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/brand/dhruv&oleg_chinese.jpeg"
        alt="Dhruv and Oleg in wizard hats and fake beards at a hackathon venue, doing their best sage impression"
        className="landing-candid-photo"
        loading="lazy"
      />
      <figcaption className="landing-candid-caption">
        Two of the four of us, mid-hackathon, having found the venue's costume rack. The detection engine was unaffected.
      </figcaption>
    </figure>
  );
}

// ---------------------------------------------------------------- Mauritius

const KREOL = [
  { text: "Partaz ou OTP ar nou", reading: "A request for your code", flagged: true },
  { text: "Pa partaz ou OTP ar personn", reading: "The bank's own advice", flagged: false },
  { text: "Ou kont pou bloke si ou pa konfirm", reading: "A threat to block the account", flagged: true },
];

const DOMAINS = [
  { host: "internet.mcb.mu", reading: "MCB's own site", genuine: true },
  { host: "mcb-secure.top", reading: "Brand name on an unrelated domain", genuine: false },
  { host: "mcb.nu", reading: "Same letters, wrong country code", genuine: false },
  { host: "mсb.mu", reading: "A Cyrillic с posing as a c", genuine: false },
];

export function MauritiusSection() {
  return (
    <section className="landing-section" aria-labelledby="mauritius-heading">
      <SectionHead
        id="mauritius-heading"
        title="Made for Mauritius, from the lexicon up"
        lede="Two things a generic scam filter can't do: read Kreol Morisien the way people write it, and know which domains belong to which Mauritian institution."
      />
      <div className="landing-duo">
        <article className="landing-panel">
          <h3 className="landing-h3">A Kreol engine that understands negation</h3>
          <p className="landing-body">
            The lexicon has Kreol rules next to the English and French ones, and it knows the difference between advice and a
            request. The language model is grounded with a Kreol translation memory where every row carries its review status,
            and only human-reviewed rows feed it.
          </p>
          <ul className="landing-rows">
            {KREOL.map((row) => (
              <li key={row.text} data-tone={row.flagged ? "bad" : "good"}>
                <span className="landing-row-mark">{row.flagged ? <XIcon className="size-4" /> : <CheckIcon className="size-4" />}</span>
                <span className="landing-row-text">&ldquo;{row.text}&rdquo;</span>
                <span className="landing-row-reading">{row.reading}</span>
              </li>
            ))}
          </ul>
        </article>
        <article className="landing-panel">
          <h3 className="landing-h3">It knows the local domains</h3>
          <p className="landing-body">
            An institution registry lists the official domains of MCB, SBM, Absa, Bank One, my.t, Emtel and the MRA. The parser
            understands .mu suffixes like gov.mu and com.mu, and every lookalike explanation names the real domain.
          </p>
          <ul className="landing-rows">
            {DOMAINS.map((row) => (
              <li key={row.host} data-tone={row.genuine ? "good" : "bad"}>
                <span className="landing-row-mark">{row.genuine ? <CheckIcon className="size-4" /> : <XIcon className="size-4" />}</span>
                <span className="landing-row-text landing-mono">{row.host}</span>
                <span className="landing-row-reading">{row.reading}</span>
              </li>
            ))}
          </ul>
        </article>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------- Checks

const CHECKS = [
  { Icon: LinkIcon, title: "Lookalike links", body: "Typos, swapped letters, brand names on unrelated domains and Unicode homoglyphs, for Mauritian institutions and global brands." },
  { Icon: ShieldIcon, title: "Certificate identity", body: "Who a site's certificate was issued to, at what validation level, and whether it is valid. The old green bar, read for you." },
  { Icon: WarningIcon, title: "Threat lists", body: "OpenPhish phishing pages and URLhaus malware, refreshed from the feeds, plus Google Safe Browsing when a key is set." },
  { Icon: TrendIcon, title: "Brand-new domains", body: "Registration dates and certificate history, because scam sites are set up days before they are used." },
  { Icon: SearchIcon, title: "Phishing-kit tells", body: "Pages cloned from a real bank, logos loaded from its site, and form data sent to Telegram bots." },
  { Icon: ImageIcon, title: "Screenshots", body: "On-device OCR reads a screenshot of a message so it can be checked like pasted text." },
  { Icon: DocumentIcon, title: "Forged documents", body: "Metadata, error-level analysis and layout checks on PDFs, Word files and images of receipts." },
  { Icon: LayersIcon, title: "Scam waves", body: "Privacy-minimised fingerprints connect repeated reports into campaigns, without storing the messages." },
];

export function ChecksSection() {
  return (
    <section className="landing-section" aria-labelledby="checks-heading">
      <SectionHead
        id="checks-heading"
        title="What FraudLens checks"
        lede="Every check below is deterministic code with tests. The AI only ever reads language."
      />
      <ul className="landing-checks">
        {CHECKS.map(({ Icon, title, body }) => (
          <li key={title} className="landing-check">
            <Icon className="landing-check-icon" />
            <h3 className="landing-h4">{title}</h3>
            <p className="landing-small">{body}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

// ---------------------------------------------------------------- Get it

export function GetItSection() {
  return (
    <section className="landing-section" aria-labelledby="get-heading" id="get-it">
      <SectionHead
        id="get-heading"
        title="Get FraudLens where you need it"
        lede="The web app runs in any browser. The extension and the add-in install from the source while their store listings are pending."
      />
      <div className="landing-installs">
        <article className="landing-install">
          <h3 className="landing-h3">Chrome extension</h3>
          <p className="landing-small">Link Guard for Chrome, Brave and Edge.</p>
          <ol className="landing-steps">
            <li>Download the project from GitHub and unzip it.</li>
            <li>
              Open <span className="landing-mono">chrome://extensions</span> and turn on Developer mode.
            </li>
            <li>
              Choose <strong>Load unpacked</strong> and pick the <span className="landing-mono">extension</span> folder.
            </li>
          </ol>
          <div className="landing-install-links">
            <a className="landing-btn landing-btn-dark" href={`${REPO_URL}/tree/main/extension`} target="_blank" rel="noopener noreferrer">
              Extension source
            </a>
            <a className="landing-link" href="/link-guard-privacy.html">
              Privacy policy
            </a>
          </div>
        </article>
        <article className="landing-install">
          <h3 className="landing-h3">Outlook add-in</h3>
          <p className="landing-small">For Outlook on the web and new Outlook for Windows.</p>
          <ol className="landing-steps">
            <li>
              Get the add-in&apos;s <span className="landing-mono">manifest.xml</span> from the team.
            </li>
            <li>
              Go to <span className="landing-mono">aka.ms/olksideload</span>, then My add-ins and Custom add-ins.
            </li>
            <li>
              Choose <strong>Add from file</strong> and pick the manifest.
            </li>
          </ol>
          <div className="landing-install-links">
            <a className="landing-btn landing-btn-dark" href={`${REPO_URL}/tree/main/outlook-addin`} target="_blank" rel="noopener noreferrer">
              Add-in source
            </a>
            <a className="landing-link" href="https://aka.ms/olksideload" target="_blank" rel="noopener noreferrer">
              Outlook add-ins page
            </a>
          </div>
        </article>
        <article className="landing-install landing-install-dark">
          <h3 className="landing-h3">Web app</h3>
          <p className="landing-small">Works on any phone or computer. Add it to your home screen to use it like an app.</p>
          <Link href="/app" className="landing-btn landing-btn-light">
            Check a message now
          </Link>
          <a className="landing-link landing-link-light" href={REPO_URL} target="_blank" rel="noopener noreferrer">
            Full source on GitHub
          </a>
        </article>
      </div>
    </section>
  );
}

/**
 * UI copy in English, French and Kreol Morisien.
 *
 * DEMO NOTE (Innovation criterion): the EN / FR / KREOL switch in the header
 * changes every string on screen AND the `language` hint sent to
 * /api/analyze. Show it live by switching to KREOL before pasting a Kreol
 * scam SMS.
 *
 * The Kreol strings are a first draft and need a review by the Kreol
 * language owner before the demo.
 */

import type { ValidationReason } from "./api";
import type { QuizLanguage, TrendCategory } from "./learn-content";
import type { SafeCheckKey, SignalKind, StepKey } from "./result";
import type { LanguageHint, Severity, ScamStage } from "./types";

/** One label per wait stage: 0–4s, 4–15s, 15–40s, 40s+ (see components/WaitProgress.tsx). */
export type WaitStages = readonly [string, string, string, string];

export type UiLanguage = Extract<LanguageHint, "en" | "fr" | "kreol">;

export const UI_LANGUAGES: readonly { id: UiLanguage; label: string; htmlLang: string }[] = [
  { id: "en", label: "EN", htmlLang: "en" },
  { id: "fr", label: "FR", htmlLang: "fr" },
  { id: "kreol", label: "KREOL", htmlLang: "mfe" },
];

export interface Copy {
  languageSwitcher: string;
  headline: string;
  subline: string;
  /** Landing page positioning, above the existing headline/subline check form. */
  home: {
    tagline: string;
    pitch: string;
    bullets: readonly string[];
    payCta: string;
    payCtaSub: string;
  };
  messageLabel: string;
  placeholder: string;
  submit: string;
  /**
   * Staged copy for a long wait (components/WaitProgress.tsx). Index = stage:
   * 0–4s, 4–15s, 15–40s, 40s+. Never a percentage or a time estimate.
   */
  wait: {
    check: WaitStages;
    /** Compact versions on the disabled submit button: same stages, fewer words. */
    checkShort: WaitStages;
    screenshot: WaitStages;
    /** Accessible name for the progress bar. */
    progressLabel: string;
    cancel: string;
  };
  uploadScreenshot: string;
  /** Short micro-label under the upload button's icon. */
  screenshotLabel: string;
  /**
   * Replaces privacyNote whenever a screenshot is involved. Must describe what
   * the server actually does: /api/analyze/screenshot receives the image as-is,
   * then redacts the OCR text before analysing it.
   */
  imagePrivacyNote: string;
  shot: {
    remove: string;
    alt: string;
    extracted: string;
    typeInstead: string;
  };
  /** Must only claim what lib/redact.ts actually removes. */
  privacyNote: string;
  telegram: string;
  recentTitle: string;
  recentEmpty: string;
  charCount: (n: number, max: number) => string;
  tooLong: string;
  retry: string;
  errors: {
    validationTitle: string;
    validation: Record<ValidationReason, string>;
    llmTitle: string;
    llm: string;
    networkTitle: string;
    network: string;
    timeoutTitle: string;
    timeout: string;
    ocrTitle: string;
    ocr: string;
    unexpectedTitle: string;
    unexpected: string;
  };
  relativeTime: (ms: number) => string;
  /** Tab-bar accessible names. The bar itself is icons only (mockup/Main.html). */
  tabs: { check: string; learn: string; trends: string; settings: string; newCheck: string };
  /** Check screen (frontend/design/mockup/Main.html). */
  check: {
    /** Time-of-day greeting above the hero question. */
    greeting: (hour: number) => string;
    question: string;
    heroLine: string;
    paste: string;
    /** Shown when the clipboard is empty or the browser refuses to read it. */
    pasteFallback: string;
    screenshot: string;
    payRow: string;
    /**
     * Shown only before the first check. A new user otherwise lands on a
     * dashboard of empty cards with nothing saying what the app is for.
     */
    intro: { title: string; points: readonly string[] };
    /** Checking state (design/mockup/Checking.png). */
    checkingLabel: string;
    checkingNote: string;
    week: { title: string; checks: (n: number) => string; caught: (n: number) => { strong: string; rest: string }; nothing: string };
    practice: { title: string; streak: (n: number) => string; start: string };
    install: { body: string; add: string; notNow: string; iosTitle: string; iosStep1: string; iosStep2: string };
    recent: { title: string; empty: string; short: Record<"safe" | "suspicious" | "scam", string> };
  };
  /**
   * The "Tools" list on Radar. Batch scan, Conversation and Sandbox have no
   * tab of their own in the five-slot bar, so this card is their entry point.
   */
  tools: { title: string; batch: string; conversation: string; sandbox: string; batchHint: string; conversationHint: string; sandboxHint: string };
  /** Settings screen: the language switch, the privacy note and an about section. */
  settings: {
    title: string;
    /** Appearance: follow the device, or force light/dark. */
    theme: { title: string; system: string; light: string; dark: string; note: string };
    languageTitle: string;
    languageNote: string;
    privacyTitle: string;
    privacyBody: string;
    aboutTitle: string;
    aboutBody: string;
    teamLogoAlt: string;
  };
  trends: {
    title: string;
    intro: string;
    /** Heading for the static reference list of local scam formats. */
    knownFormats: string;
    categories: { title: string; body: string; example: string }[];
    footerNote: string;
    /**
     * Real aggregate counts from GET /api/trends (components/TrendsContent.tsx)
     *, genuine usage, never seeded/fabricated numbers (root CLAUDE.md's "no
     * fake live statistics" rule), so there is no "demonstration dataset"
     * label here the way a seeded version of this page would need.
     */
    live: {
      heading: string;
      reportedSenders: (n: number) => string;
      campaigns: (n: number) => string;
      topSendersTitle: string;
      topCampaignsTitle: string;
      reports: (n: number) => string;
      messages: (n: number) => string;
      empty: string;
      loading: string;
      error: string;
    };
  };
  conversation: { title: string; intro: string; thread: string; empty: string; add: string; submit: string; reset: string; progress: string; pending: string; message: string; unknownStage: string; verdicts: Record<"safe" | "suspicious" | "scam", string> };
  result: {
    networkLink: string;
    journey: { title: string; whatNextTitle: string; youAreHere: string; caveat: string; labels: Record<ScamStage, string> };
    /**
     * The reveal checklist shown right after a response arrives (see
     * lib/result.ts's revealSteps + components/InvestigationReveal.tsx).
     * Every line is built from a field actually present on that response -
     * never shown for data the backend didn't return.
     */
    investigate: {
      heading: string;
      messageRead: string;
      claimedIdentity: (name: string) => string;
      linksChecked: string;
      linkFlagged: (host: string) => string;
      identityChecked: string;
      identityMismatch: string;
      communityNew: string;
      communityFlagged: (n: number) => string;
      stageIdentified: (stage: string) => string;
      campaignNew: string;
      campaignMatched: string;
    };
    title: string;
    fromSender: (sender: string) => string;
    back: string;
    warningSigns: (n: number) => string;
    risk: (score: number) => string;
    /** The dark result hero and the two-card row (design/mockup/Result-*.png). */
    hero: {
      riskScore: string;
      outOf: string;
      warningSignsLabel: string;
      signsFound: (n: number) => string;
      linkMadeLabel: string;
      daysAgo: (n: number) => string;
    };
    whatsWrong: string;
    signsUnit: (n: number) => string;
    theLink: string;
    daysOld: (n: number) => string;
    realSite: (domain: string) => string;
    linksTitle: string;
    linksToTap: (n: number) => string;
    noLinkBody: string;
    scamAdvice: string;
    messageYouSent: string;
    /** Shown once, above the highlighted message, when at least one signal has evidence to highlight ("Scam X-Ray"). */
    xrayHint: string;
    whyTitle: string;
    signalTitles: Record<SignalKind, string>;
    genericSignal: string;
    severity: Record<Severity, string>;
    /** "Claimed vs. actual" identity comparison, from an IDENTITY_MISMATCH signal's structured fields. */
    identity: {
      title: string;
      claimsToBe: string;
      recognized: string;
      linksTo: string;
      paysTo: string;
      officialSite: string;
      unverified: string;
      caveat: string;
    };
    /** "Why FraudLens flagged this", signals grouped by their `source`, plus community intelligence. */
    evidence: {
      title: string;
      aiTitle: string;
      deterministicTitle: string;
      communityTitle: string;
      communityLine: (n: number) => string;
      sourcesAgree: (n: number) => string;
    };
    /** Localized lookalike_url description, used when the backend's description parses. */
    lookalikeDomain: (host: string, domain: string) => string;
    lookalikeBrand: (host: string, brand: string) => string;
    linkCheck: {
      title: string;
      linkInMessage: string;
      imitates: string;
      domainAge: string;
      domainAgeValue: (days: number) => string;
      reportedByOthers: string;
      reportedValue: (n: number) => string;
    };
    whatToDoTitle: string;
    steps: Record<StepKey, string>;
    whatWeCheckedTitle: string;
    checks: Record<SafeCheckKey, string>;
    /**
     * Terse versions for the "What we checked" card, which sits in a narrow
     * 7-of-12 column (design/mockup/Result-Genuine.png). The full sentences
     * above are still used where there is room to read them, such as the Learn
     * quiz explanations.
     */
    checksShort: Record<SafeCheckKey, string>;
    safeCaveat: string;
    report: {
      reportSender: string;
      reportMessage: string;
      senderLabel: string;
      senderPlaceholder: string;
      submit: string;
      sending: string;
      done: (count: number) => string;
      failed: string;
      note: string;
    };
    sentTitle: string;
    sentBody: string;
    /** "What was sent" explanation when the text came from a screenshot (the image itself also left the device). */
    sentBodyScreenshot: string;
    /** Which AI (if any) served the semantic analysis, local self-hosted model, hosted fallback, or none. */
    aiSource: {
      label: string;
      local: string;
      /** "{provider}" is replaced with the fallback provider id (e.g. "anthropic"). */
      fallback: string;
      unavailable: string;
    };
    checkAnother: string;
    missingTitle: string;
    missingBody: string;
  };
  /**
   * Fraud Replay (components/FraudReplay.tsx, app/replay/page.tsx): the same
   * stored analysis result as the result screen, retold as a chronological
   * story instead of a stacked report. Reuses result.* copy wherever a
   * concept is shared (identity, journey, campaign match), this only adds
   * the narrative framing and the per-signal "why this works" line.
   */
  replay: {
    title: string;
    subtitle: string;
    openReplay: string;
    back: string;
    stepContact: string;
    stepWanted: string;
    stepJourney: string;
    experienceSafely: string;
    stepPattern: string;
    patternMatched: (reports: number, senders: number, domains: number) => string;
    stepStop: string;
    /** One line of general scam psychology per signal kind, never a claim about this specific sender. */
    belief: Record<SignalKind, string>;
  };
  /**
   * Simple mode (components/SimpleMode.tsx): an action-first, plain-language
   * replacement for the detailed result, short sentences, no jargon, one
   * decision at a time. Toggled from the result screen, remembered across
   * visits (lib/storage.ts's loadSimpleMode/saveSimpleMode).
   */
  simple: {
    turnOn: string;
    turnOff: string;
    stopScam: string;
    stopSuspicious: string;
    claims: (name: string) => string;
    but: string;
    issueFallback: string;
    readAloud: string;
    stopReading: string;
  };
  /**
   * Shareable safety card (components/SafetyCard.tsx): a compact summary a
   * user can copy or share with someone else, reusing simple.* for the
   * headline/claim text rather than duplicating it.
   */
  card: {
    cardTitle: string;
    whyHeading: string;
    helpMeExplain: string;
    share: string;
    copyText: string;
    copied: string;
  };
  learn: {
    headline: string;
    streak: (days: number) => string;
    /** The Today / Streak card pair (design/mockup/Learn.png). */
    cards: {
      todayTitle: string;
      todayCount: (done: number, goal: number) => string;
      more: (n: number) => string;
      doneToday: string;
      streakTitle: string;
      days: (n: number) => string;
      noStreak: string;
    };
    quizLabel: string;
    scam: string;
    genuine: string;
    progress: (n: number, total: number, right: number) => string;
    correct: string;
    incorrect: string;
    isScam: string;
    isGenuine: string;
    whyLabel: string;
    inEnglish: string;
    next: string;
    seeScore: string;
    scoreLabel: string;
    scoreLine: (right: number, total: number) => string;
    scoreComment: (right: number, total: number) => string;
    best: (best: number, total: number) => string;
    playAgain: string;
    /** Required by data/kreol-dataset/CLAUDE.md: synthetic examples must be identified as synthetic. */
    syntheticNote: string;
    trendsTitle: string;
    trends: Record<TrendCategory, { tag: string; body: string }>;
    /** Language names as used inside a sentence in this UI language. */
    languageName: Record<QuizLanguage, string>;
    /** Shown instead of the quiz when the UI language has too few practice messages. */
    fewItems: (language: string) => string;
    offerOther: (language: string) => string;
    /** Extra line when the offered set is Kreol, which is often code-switched. */
    kreolMixNote: string;
    practisingIn: (language: string) => string;
    dailyProgress: (answered: number, goal: number) => string;
    dailyDone: string;
    celebrate: {
      title: (days: number) => string;
      dayOne: string;
      streakLine: (days: number) => string;
      score: (right: number, total: number) => string;
      mistakesTitle: string;
      allRight: string;
      keepGoing: string;
    };
    /** Dev-only controls (visible in `next dev` only). */
    dev: { title: string; reset: string; seed: string };
  };
  /** "Before you pay", a separate entry point from the Check screen, for a payment request rather than a message to analyse. */
  safepay: {
    title: string;
    intro: string;
    requesterLabel: string;
    requesterPlaceholder: string;
    channelLabel: string;
    channelPlaceholder: string;
    recipientLabel: string;
    recipientPlaceholder: string;
    amountLabel: string;
    amountPlaceholder: string;
    /** Heading over the amount once shown in the result (no "(optional)" suffix). */
    amountHeading: string;
    messageLabel: string;
    messagePlaceholder: string;
    submit: string;
    missingInput: string;
    pauseTitle: string;
    okTitle: string;
    okBody: string;
    recipientReportedLine: (n: number) => string;
    verifyCta: string;
    reportCta: string;
    /** Resets the form for another payment check (shown under a result). */
    checkAnother: string;
    /** Navigates away to the normal Check screen (shown under the empty form). */
    back: string;
  };
}

/**
 * A Kreol string not written yet because we weren't confident in it. It
 * shows the English so the screen stays readable, and marks the spot for
 * the Kreol reviewer: grep DRAFT_KREOL. Nothing currently falls back to
 * English; TODO_KREOL is kept for a string added faster than it is translated.
 */
const TODO_KREOL = <T,>(english: T): T => english;

/**
 * Kreol that IS written but has not been through the Kreol owner's review.
 *
 * Unlike TODO_KREOL, this renders the Kreol: leaving English on screen for a
 * Kreol user is the worse failure. It stays a named wrapper so the strings
 * needing review are still one grep away (grep DRAFT_KREOL).
 */
const DRAFT_KREOL = <T,>(kreol: T): T => kreol;

const LEARN_EN: Copy["learn"] = {
  headline: "Learn to spot them",
  streak: (d) => `${d}-day streak`,
  cards: {
    todayTitle: "Today",
    todayCount: (done, goal) => `${done} of ${goal}`,
    more: (n) => `${n} more to keep your streak`,
    doneToday: "Today's practice is done",
    streakTitle: "Streak",
    days: (n) => (n === 1 ? "day" : "days"),
    noStreak: "Answer 5 to start",
  },
  quizLabel: "Scam or genuine?",
  scam: "Scam",
  genuine: "Genuine",
  progress: (n, t, k) => `Question ${n} of ${t} · you got ${k} right so far`,
  correct: "Right.",
  incorrect: "Not quite.",
  isScam: "This one is a scam.",
  isGenuine: "This one is genuine.",
  whyLabel: "Why",
  inEnglish: "In English",
  next: "Next",
  seeScore: "See your score",
  scoreLabel: "Your score",
  scoreLine: (k, t) => `You spotted ${k} of ${t} correctly.`,
  scoreComment: (k, t) =>
    k === t
      ? "Perfect. You'd spot these in real life too."
      : k / t >= 0.75
        ? "Sharp eyes. Play again to see a different mix."
        : "These are tricky on purpose. Play again and watch for the warning signs.",
  best: (b, t) => `Your best: ${b} / ${t}`,
  playAgain: "Play again",
  syntheticNote:
    "The practice messages and examples on this page are made up, from our Kreol dataset. Names like OceanBank are fictional.",
  // Not "this week": we have no data to evidence a time-based claim.
  trendsTitle: "Common scam patterns",
  trends: {
    parcel_fee: {
      tag: "Parcel fee",
      body: "A text says your parcel is stuck at customs and asks for a small fee through a link. Real couriers don't collect fees by SMS link, so check on the courier's own website instead.",
    },
    fake_relative: {
      tag: "Fake relative",
      body: "Someone says they're your child or a relative on a new number, needs money urgently, and asks you not to tell anyone. Call them on the number you already have before you send anything.",
    },
    investment: {
      tag: "Investment",
      body: "A stranger promises to double or triple your money in days, with no risk. Guaranteed returns don't exist: the deposit is the scam.",
    },
  },
  languageName: { en: "English", fr: "French", kreol: "Kreol" },
  fewItems: (l) => `More practice messages in ${l} are coming soon.`,
  offerOther: (l) => `Practise in ${l} instead`,
  kreolMixNote: "Kreol messages often mix in some English or French, like real texts in Mauritius.",
  practisingIn: (l) => `Practising in ${l}`,
  dailyProgress: (a, g) => `Today: ${a} of ${g} for your daily streak`,
  dailyDone: "Today's practice is done.",
  celebrate: {
    title: (n) => `${n} day streak`,
    dayOne: "Day one done. Come back tomorrow to start a streak.",
    streakLine: (n) => `You've practised ${n} days in a row.`,
    score: (r, t) => `Today: ${r} of ${t} right`,
    mistakesTitle: "Worth another look",
    allRight: "You got every one right today. Nothing to review.",
    keepGoing: "Keep going",
  },
  dev: { title: "Dev tools", reset: "Reset streak", seed: "Pretend 2 days done" },
};

function relative(ms: number, words: { now: string; min: string; hour: string; day: string; ago: (s: string) => string }) {
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1) return words.now;
  if (minutes < 60) return words.ago(`${minutes} ${words.min}`);
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return words.ago(`${hours} ${words.hour}`);
  return words.ago(`${Math.floor(hours / 24)} ${words.day}`);
}

const fmt = (n: number, locale: string) => n.toLocaleString(locale);

const JOURNEY_EN: Copy["result"]["journey"] = {
  title: "Scam journey", whatNextTitle: "What may happen next", youAreHere: "You are here",
  caveat: "A possible progression, not a prediction. Earlier stages are not confirmed by this message.",
  labels: { INITIAL_CONTACT: "Initial contact", TRUST_BUILDING: "Building trust", AUTHORITY_CLAIM: "Claiming authority", URGENCY: "Creating urgency", CREDENTIAL_REQUEST: "Requesting credentials", OTP_REQUEST: "Requesting an OTP", PAYMENT_REQUEST: "Requesting payment", PAYMENT_PRESSURE: "Pressuring you to pay", ACCOUNT_TAKEOVER: "Account takeover" },
};
const JOURNEY_FR: Copy["result"]["journey"] = {
  title: "Parcours de l’arnaque", whatNextTitle: "Ce qui pourrait suivre", youAreHere: "Vous êtes ici",
  caveat: "Une progression possible, pas une prédiction. Ce message ne confirme pas les étapes précédentes.",
  labels: { INITIAL_CONTACT: "Premier contact", TRUST_BUILDING: "Mise en confiance", AUTHORITY_CLAIM: "Autorité revendiquée", URGENCY: "Création d’urgence", CREDENTIAL_REQUEST: "Demande d’identifiants", OTP_REQUEST: "Demande de code OTP", PAYMENT_REQUEST: "Demande de paiement", PAYMENT_PRESSURE: "Pression pour payer", ACCOUNT_TAKEOVER: "Prise de contrôle du compte" },
};
const CONVERSATION_EN: Copy["conversation"] = {
  title: "See the conversation unfold", intro: "Add messages in the order you received them. Follow the warning signs as the conversation develops.",
  thread: "Conversation", empty: "Start with the first message you received.", add: "Next message", submit: "Analyze message", reset: "Clear conversation", progress: "Furthest stage detected", pending: "Add a message to reveal its stage. Each message is analyzed separately; the thread shows the furthest stage detected.", message: "Message", unknownStage: "Stage not identified", verdicts: { safe: "No warning signs", suspicious: "Suspicious", scam: "Scam" },
};
const CONVERSATION_FR: Copy["conversation"] = {
  title: "Suivez la conversation", intro: "Ajoutez les messages dans l’ordre de réception. Suivez les signaux d’alerte au fil de la conversation.",
  thread: "Conversation", empty: "Commencez par le premier message reçu.", add: "Message suivant", submit: "Analyser le message", reset: "Effacer la conversation", progress: "Étape la plus avancée détectée", pending: "Ajoutez un message pour identifier son étape. Chaque message est analysé séparément ; le fil affiche l’étape la plus avancée détectée.", message: "Message", unknownStage: "Étape non identifiée", verdicts: { safe: "Aucun signal d’alerte", suspicious: "Suspect", scam: "Arnaque" },
};

const INVESTIGATE_EN: Copy["result"]["investigate"] = {
  heading: "FraudLens investigated",
  messageRead: "Message read",
  claimedIdentity: (name) => `Claimed institution: ${name}`,
  linksChecked: "Links checked against known bank and telecom domains",
  linkFlagged: (host) => `Suspicious link found: ${host}`,
  identityChecked: "Sender identity checked",
  identityMismatch: "Identity mismatch found",
  communityNew: "Not reported before",
  communityFlagged: (n) => (n === 1 ? "Reported by another user before" : `Reported by ${n} other users before`),
  stageIdentified: (stage) => `Scam stage identified: ${stage}`,
  campaignNew: "New pattern: no matching campaign yet",
  campaignMatched: "Matches a known scam campaign",
};

const RESULT_EN: Copy["result"] = {
  journey: JOURNEY_EN,
  investigate: INVESTIGATE_EN,
  networkLink: "View fraud network",
  title: "Result",
  fromSender: (s) => `SMS from ${s}`,
  back: "Back",
  warningSigns: (n) => (n === 0 ? "No warning signs" : n === 1 ? "1 warning sign" : `${n} warning signs`),
  risk: (s) => `Risk ${s} / 100`,
  hero: {
    riskScore: "Risk score",
    outOf: "/ 100",
    warningSignsLabel: "Warning signs",
    signsFound: (n) => `${n} found`,
    linkMadeLabel: "Link made",
    daysAgo: (n) => (n === 0 ? "today" : n === 1 ? "1 day ago" : `${n} days ago`),
  },
  whatsWrong: "What's wrong",
  signsUnit: (n) => (n === 1 ? "sign" : "signs"),
  theLink: "The link",
  daysOld: (n) => (n === 1 ? "day old" : "days old"),
  realSite: (d) => `Real site: ${d}`,
  linksTitle: "Links",
  linksToTap: (n) => (n === 1 ? "to tap" : "to tap"),
  noLinkBody: "Nothing here can open a fake page.",
  scamAdvice: "Do not pay, do not open the link, and never share a code sent to your phone.",
  messageYouSent: "The message you sent",
  whyTitle: "Why this looks wrong",
  signalTitles: {
    sender_mismatch: "The sender is not who it claims",
    lookalike_url: "The link is not the bank",
    urgency_language: "It rushes you",
    spoofed_identity: "It pretends to be someone you trust",
    credential_request: "It asks for a code or personal details",
    payment_request: "It asks you to pay or send money",
    prize_offer: "It promises something too good to be true",
    secrecy: "It asks you to keep it secret",
  },
  genericSignal: "Something doesn't look right",
  severity: { low: "Low", medium: "Medium", high: "High" },
  xrayHint: "Tap a highlighted phrase to see why it was flagged.",
  identity: {
    title: "Claimed vs. actual",
    claimsToBe: "Claims to be",
    recognized: "Recognised institution",
    linksTo: "But the link goes to",
    paysTo: "But the payment goes to",
    officialSite: "Official site",
    unverified: "Unverified",
    caveat: "Looking similar doesn't prove a link or account is genuine.",
  },
  evidence: {
    title: "Why FraudLens flagged this",
    aiTitle: "AI analysis",
    deterministicTitle: "Deterministic checks",
    communityTitle: "Community intelligence",
    communityLine: (n) => (n === 1 ? "Reported by others 1 time" : `Reported by others ${n} times`),
    sourcesAgree: (n) => `${n} independent evidence sources agree`,
  },
  lookalikeDomain: (h, d) => `${h} looks like ${d}, but it isn't.`,
  lookalikeBrand: (h, b) => `${h} uses the ${b} name, but it isn't a real ${b} website.`,
  linkCheck: {
    title: "Link check",
    linkInMessage: "Link in the message",
    imitates: "Imitates",
    domainAge: "Domain age",
    domainAgeValue: (d) => (d < 1 ? "Registered today" : d === 1 ? "1 day old" : `${d} days old`),
    reportedByOthers: "Reported by others",
    reportedValue: (n) => (n === 1 ? "1 time" : `${n} times`),
  },
  whatToDoTitle: "What to do now",
  steps: {
    dont_open_or_reply: "Don't open the link and don't reply.",
    block_sender: "Block the sender so they can't contact you again.",
    report_to_bank: "Tell your bank's fraud team, using the number printed on your card.",
    verify_official:
      "Check with the company directly, through its official app or website. Don't use the contact details in the message.",
    dont_share_code: "Never share a code sent to your phone, whoever asks for it.",
    call_bank_card: "If you're worried, call your bank on the number printed on your card.",
    delete_and_report: "Delete the message and report it.",
  },
  whatWeCheckedTitle: "What we checked",
  checks: {
    no_link: "No link and nothing to click",
    no_lookalike: "No link imitating a bank or telecom",
    informs_not_asks: "It tells you something rather than asking you to act",
    last_four_only: "Shows only the last 4 digits, as a real bank does",
    no_pressure: "No urgency, no code requested, no secrecy",
  },
  checksShort: {
    no_link: "No link",
    no_lookalike: "No fake link",
    informs_not_asks: "Nothing to do",
    last_four_only: "Last 4 digits only",
    no_pressure: "No code, no rush",
  },
  safeCaveat:
    "We cannot promise a message is real. If money is involved and you have any doubt, call your bank on the number on your card.",
  report: {
    reportSender: "Report this sender",
    reportMessage: "Report this message",
    senderLabel: "Who sent it?",
    senderPlaceholder: "Phone number or name",
    submit: "Send report",
    sending: "Sending…",
    done: (n) => (n > 1 ? `Reported. ${n} reports for this sender so far.` : "Reported. Thank you for warning others."),
    failed: "We couldn't send the report. Please try again.",
    note: "Reporting shares the sender's number with FraudLens so others can be warned.",
  },
  sentTitle: "What was sent for analysis",
  sentBody: "Only this version left your phone. Phone numbers, emails and account numbers were replaced first.",
  sentBodyScreenshot:
    "Your screenshot was sent to our server to read the text, with everything in it visible. Your result is based only on this redacted version of the text.",
  aiSource: {
    label: "Analyzed by",
    local: "Local AI model (self-hosted, on-device)",
    fallback: "Cloud fallback AI ({provider})",
    unavailable: "AI unavailable: deterministic checks only",
  },
  checkAnother: "Check another message",
  missingTitle: "No check to show",
  missingBody: "Paste a message on the Check screen to see a result here.",
};

const REPLAY_EN: Copy["replay"] = {
  title: "Fraud Replay",
  subtitle: "How this message was built to work, told as a story instead of a report.",
  openReplay: "See how this scam works",
  back: "Back to result",
  stepContact: "The contact",
  stepWanted: "What it wanted from you",
  stepJourney: "Where this is heading",
  experienceSafely: "Experience this safely",
  stepPattern: "The wider pattern",
  patternMatched: (reports, senders, domains) =>
    `Matches earlier reports: ${reports} report${reports === 1 ? "" : "s"} across ${senders} sender${senders === 1 ? "" : "s"} and ${domains} domain${domains === 1 ? "" : "s"}.`,
  stepStop: "Stop here",
  belief: {
    sender_mismatch: "A message feels more trustworthy when it looks like it's from a number or account you recognise.",
    lookalike_url: "A link that looks almost right is easy to miss when you're moving fast.",
    urgency_language: "Urgency shortens the time you'd normally spend checking.",
    spoofed_identity: "Borrowing a trusted name makes the request feel official.",
    credential_request: "A code or password can feel harmless to share when the request sounds routine.",
    payment_request: "Framing it as a fee or refund makes paying feel like the normal next step.",
    prize_offer: "An unexpected reward lowers your guard before you check who's actually asking.",
    secrecy: "Being told to keep it quiet removes the chance for someone else to catch the trick.",
  },
};

const SIMPLE_EN: Copy["simple"] = {
  turnOn: "Simple mode",
  turnOff: "Show full details",
  stopScam: "Don't send money yet",
  stopSuspicious: "Be careful",
  claims: (name) => `This message says it's from ${name}.`,
  but: "But",
  issueFallback: "FraudLens found warning signs in this message.",
  readAloud: "Read this aloud",
  stopReading: "Stop reading",
};

const CARD_EN: Copy["card"] = {
  cardTitle: "FraudLens safety check",
  whyHeading: "Why we're concerned",
  helpMeExplain: "Help me explain this",
  share: "Share",
  copyText: "Copy text",
  copied: "Copied",
};

// Screenshot upload copy, held in constants so each language reuses one source.
// Matches backend/src/routes/index.js (/analyze/screenshot): the image arrives
// as-is, and the OCR text is redacted (services/redact) before any analysis.
const IMAGE_PRIVACY_EN =
  "Screenshots are sent to our server as they are, with names and numbers still visible. The server reads the text and removes phone numbers, emails and account numbers before anything is analysed. Your result comes only from the redacted text, after you review it and press Check.";

/** Stage 3 (40s+) is shown once and stays: honest, calm, no repeated apology. */
const STILL_WORKING_EN = "Still working, this can take a couple of minutes on our current setup.";

const WAIT_EN: Copy["wait"] = {
  check: ["Checking the message…", "Looking for warning signs…", "The AI is reading closely…", STILL_WORKING_EN],
  checkShort: ["Checking…", "Looking for signs…", "Reading closely…", "Still working…"],
  screenshot: ["Reading the screenshot…", "Pulling out the text…", "Reading the text carefully…", STILL_WORKING_EN],
  progressLabel: "Progress",
  cancel: "Cancel",
};

const SHOT_EN: Copy["shot"] = {
  remove: "Remove screenshot",
  alt: "Your screenshot",
  extracted: "Text added from your screenshot. Check it and fix anything that's wrong, then press Check.",
  typeInstead: "Type it instead",
};

type ImageReason = Extract<ValidationReason, `image_${string}`>;
const IMAGE_ERRORS_EN: Record<ImageReason, string> = {
  image_missing: "Choose a screenshot to upload.",
  image_invalid: "That file isn't a PNG, JPEG, or WEBP image.",
  image_too_large: "That image is too large. Please keep it under 5MB.",
  image_unreadable: "That image couldn't be read. Try a different file.",
  image_no_text: "We couldn't find any readable text in that screenshot.",
  image_text_too_long:
    "That screenshot has more text than we can check at once. Crop it to just the message, or paste the text.",
};

const OCR_ERROR_EN = {
  ocrTitle: "We couldn't read that image",
  ocr: "Something went wrong while reading the text. Try again, or type the message instead.",
};

const HOME_EN: Copy["home"] = {
  tagline: "See the scam before it happens.",
  pitch:
    "FraudLens doesn't just say a message looks suspicious. It shows you exactly why, in plain language, before you pay, click or share a code.",
  bullets: [
    "See exactly which words and links triggered a warning.",
    "Works in English, French and Kreol, even mixed together.",
    "Checks any link against real Mauritius bank and telecom domains.",
    "Check a message, a screenshot, or a payment you're about to make.",
  ],
  payCta: "I'm about to pay",
  payCtaSub: "Get a check before you send money, not after.",
};

const SAFEPAY_EN: Copy["safepay"] = {
  title: "Before you pay",
  intro: "A few quick questions before you send money. We'll check what we can and tell you what to do next.",
  requesterLabel: "Who's asking you to pay?",
  requesterPlaceholder: "e.g. MCB, a courier company, someone you know",
  channelLabel: "How did they contact you?",
  channelPlaceholder: "e.g. SMS, WhatsApp, phone call",
  recipientLabel: "Who are you paying?",
  recipientPlaceholder: "Phone number, account number or name",
  amountLabel: "Amount (optional)",
  amountPlaceholder: "e.g. Rs 12,500",
  amountHeading: "Amount",
  messageLabel: "Message you received (optional, but helps a lot)",
  messagePlaceholder: "Paste the message that asked you to pay, if you have one",
  submit: "Check before I pay",
  missingInput: "Tell us who's asking, or paste the message, so we have something to check.",
  pauseTitle: "Pause before paying",
  okTitle: "No warning signs found",
  okBody:
    "We didn't find a specific reason to worry, but we can't confirm this request is genuine. If you have any doubt, verify directly with the organisation using a number or app you already trust.",
  recipientReportedLine: (n) =>
    n === 1 ? "This recipient has been reported 1 time" : `This recipient has been reported ${n} times`,
  verifyCta: "Verify through official channel",
  reportCta: "Report this",
  checkAnother: "Check another payment",
  back: "Check a message instead",
};

export const COPY: Record<UiLanguage, Copy> = {
  en: {
    languageSwitcher: "Language",
    headline: "Got a message about money?",
    subline: "Paste it here before you pay, click or share a code. We will show you what looks wrong and why.",
    home: HOME_EN,
    messageLabel: "The message",
    placeholder: "Paste the SMS, WhatsApp or email text here...",
    submit: "Check this message",
    wait: WAIT_EN,
    uploadScreenshot: "Upload a screenshot",
    screenshotLabel: "Screenshot",
    imagePrivacyNote: IMAGE_PRIVACY_EN,
    shot: SHOT_EN,
    privacyNote: "Phone numbers, emails and account numbers are removed before anything is analysed.",
    telegram: "Or forward it to @FraudLensBot on Telegram.",
    recentTitle: "Recent checks",
    recentEmpty: "Nothing checked yet. Your last five checks will show here.",
    charCount: (n, max) => `${fmt(n, "en")} / ${fmt(max, "en")}`,
    tooLong: "Too long to check. Please keep it under 5,000 characters.",
    retry: "Try again",
    errors: {
      validationTitle: "We couldn't check that",
      validation: {
        message_empty: "Paste a message first, then tap check.",
        message_too_long: "That message is too long. Please keep it under 5,000 characters.",
        batch_empty: "Add at least one message to scan.",
        batch_too_many: "You can scan up to 50 messages at a time.",
        batch_item_empty: "One of the messages is empty.",
        batch_item_too_long: "One of the messages is over 5,000 characters.",
        sender_empty: "Enter the sender's number or name.",
        ...IMAGE_ERRORS_EN,
        invalid: "Something about that message didn't look right. Please check it and try again.",
      },
      llmTitle: "Our checker is busy",
      llm: "The analysis service didn't give an answer this time. Your message is still here, so try again in a moment.",
      networkTitle: "Can't reach FraudLens",
      network: "The checking service can't be reached right now. Check your connection and try again.",
      timeoutTitle: "That took too long",
      timeout: "The check took longer than expected and was stopped. Try again, it's often faster the second time.",
      ...OCR_ERROR_EN,
      unexpectedTitle: "Something went wrong",
      unexpected: "We got an answer we couldn't read. Please try again.",
    },
    relativeTime: (ms) =>
      relative(ms, { now: "just now", min: "min", hour: "h", day: "d", ago: (s) => `${s} ago` }),
    tabs: { check: "Check", learn: "Learn", trends: "Radar", settings: "Settings", newCheck: "Check a new message" },
    check: {
      greeting: (h) => (h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening"),
      question: "Is this a scam?",
      heroLine: "Paste a message before you pay, tap a link or share a code.",
      paste: "Paste & check",
      pasteFallback: "Nothing to paste yet. Type the message, or paste it in.",
      screenshot: "Check a screenshot",
      payRow: "Check before you pay",
      intro: {
        title: "What this does",
        points: [
          "Spots bank, parcel and prize scams of the kind sent in Mauritius.",
          "Reads Kreol, French and English, including messages that mix them.",
          "Phone numbers and account numbers are removed on your phone, before anything is sent.",
        ],
      },
      checkingLabel: "Checking the message",
      checkingNote: "This can take up to a minute. You can keep this screen open.",
      week: {
        title: "This week",
        checks: (n) => `${n} ${n === 1 ? "check" : "checks"}`,
        caught: (n) => ({ strong: `${n} ${n === 1 ? "scam" : "scams"}`, rest: "caught" }),
        nothing: "nothing caught",
      },
      practice: { title: "Practice", streak: (n) => `${n}-day streak`, start: "Start a streak" },
      install: {
        body: "Keep FraudLens on your Home Screen, so it's there when the next message lands.",
        add: "Add to Home Screen",
        notNow: "Not now",
        iosTitle: "On iPhone",
        iosStep1: "Tap the Share button in Safari.",
        iosStep2: 'Choose "Add to Home Screen".',
      },
      recent: {
        title: "Recent",
        empty: "Your checks will show here.",
        short: { safe: "Genuine", suspicious: "Careful", scam: "Scam" },
      },
    },
    tools: {
      title: "Tools",
      batch: "Batch scan",
      batchHint: "Several at once",
      conversation: "Conversation",
      conversationHint: "A whole thread",
      sandbox: "Sandbox",
      sandboxHint: "Practise safely",
    },
    settings: {
      title: "Settings",
      theme: {
        title: "Appearance",
        system: "System",
        light: "Light",
        dark: "Dark",
        note: "System follows your phone's own light or dark setting.",
      },
      languageTitle: "Language",
      languageNote: "Changes every screen, and tells the analysis which language to answer in.",
      privacyTitle: "Privacy",
      privacyBody:
        "Phone numbers, emails and account numbers are removed in your browser before a message is sent for analysis. Your checks are kept on this device only.",
      aboutTitle: "About",
      aboutBody: "FraudLens helps you spot a scam message before you pay, tap a link or share a code. Built in Mauritius, for Mauritius.",
      teamLogoAlt: "Dhruv and Friends logo",
    },
    trends: {
      title: "Known scam patterns in Mauritius",
      knownFormats: "Known formats",
      intro:
        "The scam formats reported often enough in Mauritius to be worth knowing by sight, plus what FraudLens has actually seen reported below.",
      categories: [
        {
          title: "Bank impersonation SMS",
          body: "Messages posing as MCB, SBM, Absa Mauritius or Bank One, warning that your account is suspended or a transfer needs urgent confirmation.",
          example: '"MCB Alert: Your account has been suspended. Verify now at mcb-secure.top"',
        },
        {
          title: "Telecom prize scams",
          body: "Fake My.t or Emtel messages claiming you've won data, airtime or cash, pushing you to click a link or call a premium number.",
          example: '"Congratulations! Your number won Rs 25,000 from My.t. Claim now: myt-prize.win"',
        },
        {
          title: "Mobile money fraud",
          body: 'A caller posing as a mobile money agent asks for your PIN or OTP to "reverse" a wrong payment or "upgrade" your account.',
          example: '"This is MCB Juice support. Share the OTP so we can cancel the wrong transfer."',
        },
      ],
      footerNote:
        "The list above is a reference, not a live feed. The numbers here are FraudLens's actual usage, real checks and reports, not a demonstration dataset.",
      live: {
        heading: "What FraudLens has actually seen",
        reportedSenders: (n) => (n === 1 ? "1 sender reported" : `${n} senders reported`),
        campaigns: (n) => (n === 1 ? "1 pattern tracked" : `${n} patterns tracked`),
        topSendersTitle: "Most-reported senders",
        topCampaignsTitle: "Most-observed patterns",
        reports: (n) => (n === 1 ? "1 report" : `${n} reports`),
        messages: (n) => (n === 1 ? "1 check" : `${n} checks`),
        empty: "Not enough activity yet: check a message to be the first.",
        loading: "Loading…",
        error: "Couldn't load this right now.",
      },
    },
    conversation: CONVERSATION_EN,
    result: RESULT_EN,
    replay: REPLAY_EN,
    simple: SIMPLE_EN,
    card: CARD_EN,
    learn: LEARN_EN,
    safepay: SAFEPAY_EN,
  },

  fr: {
    languageSwitcher: "Langue",
    headline: "Un message qui parle d'argent ?",
    subline:
      "Collez-le ici avant de payer, de cliquer ou de partager un code. Nous vous montrerons ce qui cloche et pourquoi.",
    home: {
      tagline: "Voyez l'arnaque avant qu'elle n'arrive.",
      pitch:
        "FraudLens ne se contente pas de dire qu'un message semble suspect. Il vous montre exactement pourquoi, en langage clair, avant que vous ne payiez, cliquiez ou partagiez un code.",
      bullets: [
        "Voyez exactement quels mots et liens ont déclenché une alerte.",
        "Fonctionne en anglais, français et kreol, même mélangés.",
        "Vérifie tout lien face aux vrais domaines des banques et opérateurs mauriciens.",
        "Vérifiez un message, une capture d'écran, ou un paiement que vous vous apprêtez à faire.",
      ],
      payCta: "Je m'apprête à payer",
      payCtaSub: "Une vérification avant d'envoyer de l'argent, pas après.",
    },
    messageLabel: "Le message",
    placeholder: "Collez ici le texte du SMS, WhatsApp ou e-mail...",
    submit: "Vérifier ce message",
    wait: {
      check: [
        "Vérification du message…",
        "Recherche des signaux d'alerte…",
        "L'IA lit attentivement…",
        "Toujours en cours, cela peut prendre quelques minutes avec notre configuration actuelle.",
      ],
      checkShort: ["Vérification…", "Recherche…", "Lecture attentive…", "Toujours en cours…"],
      screenshot: [
        "Lecture de la capture…",
        "Extraction du texte…",
        "Lecture attentive du texte…",
        "Toujours en cours, cela peut prendre quelques minutes avec notre configuration actuelle.",
      ],
      progressLabel: "Progression",
      cancel: "Annuler",
    },
    uploadScreenshot: "Importer une capture d'écran",
    screenshotLabel: "Capture d'écran",
    imagePrivacyNote:
      "Les captures d'écran sont envoyées telles quelles à notre serveur, noms et numéros visibles. Le serveur lit le texte et retire les numéros de téléphone, e-mails et numéros de compte avant toute analyse. Votre résultat repose uniquement sur le texte masqué, après votre relecture et votre appui sur Vérifier.",
    shot: {
      remove: "Retirer la capture",
      alt: "Votre capture d'écran",
      extracted:
        "Texte ajouté depuis votre capture. Vérifiez-le et corrigez ce qui est faux, puis appuyez sur Vérifier.",
      typeInstead: "Le saisir à la place",
    },
    privacyNote: "Les numéros de téléphone, e-mails et numéros de compte sont retirés avant toute analyse.",
    telegram: "Ou transférez-le à @FraudLensBot sur Telegram.",
    recentTitle: "Vérifications récentes",
    recentEmpty: "Aucune vérification pour l'instant. Les cinq dernières apparaîtront ici.",
    charCount: (n, max) => `${fmt(n, "fr")} / ${fmt(max, "fr")}`,
    tooLong: "Trop long. Limitez-vous à 5 000 caractères.",
    retry: "Réessayer",
    errors: {
      validationTitle: "Vérification impossible",
      validation: {
        message_empty: "Collez d'abord un message, puis appuyez sur vérifier.",
        message_too_long: "Ce message est trop long. Limitez-vous à 5 000 caractères.",
        batch_empty: "Ajoutez au moins un message.",
        batch_too_many: "Vous pouvez analyser jusqu'à 50 messages à la fois.",
        batch_item_empty: "Un des messages est vide.",
        batch_item_too_long: "Un des messages dépasse 5 000 caractères.",
        sender_empty: "Indiquez le numéro ou le nom de l'expéditeur.",
        image_missing: "Choisissez une capture d'écran à envoyer.",
        image_invalid: "Ce fichier n'est pas une image PNG, JPEG ou WEBP.",
        image_too_large: "Cette image est trop grande. Limitez-vous à 5 Mo.",
        image_unreadable: "Cette image n'a pas pu être lue. Essayez un autre fichier.",
        image_no_text: "Nous n'avons trouvé aucun texte lisible dans cette capture d'écran.",
        image_text_too_long:
          "Cette capture contient trop de texte pour une seule vérification. Recadrez-la sur le message, ou collez le texte.",
        invalid: "Ce message pose un problème. Vérifiez-le et réessayez.",
      },
      llmTitle: "Notre service est occupé",
      llm: "Le service d'analyse n'a pas répondu cette fois. Votre message est toujours là, réessayez dans un instant.",
      networkTitle: "FraudLens est injoignable",
      network: "Le service de vérification est injoignable pour le moment. Vérifiez votre connexion et réessayez.",
      timeoutTitle: "C'était trop long",
      timeout: "La vérification a pris trop de temps et a été arrêtée. Réessayez, c'est souvent plus rapide la deuxième fois.",
      ocrTitle: "Impossible de lire cette image",
      ocr: "Un problème est survenu pendant la lecture du texte. Réessayez, ou saisissez le message.",
      unexpectedTitle: "Un problème est survenu",
      unexpected: "Nous avons reçu une réponse illisible. Veuillez réessayer.",
    },
    relativeTime: (ms) =>
      relative(ms, { now: "à l'instant", min: "min", hour: "h", day: "j", ago: (s) => `il y a ${s}` }),
    tabs: { check: "Vérifier", learn: "Apprendre", trends: "Radar", settings: "Réglages", newCheck: "Vérifier un nouveau message" },
    check: {
      greeting: (h) => (h < 12 ? "Bonjour" : h < 18 ? "Bon après-midi" : "Bonsoir"),
      question: "Est-ce une arnaque ?",
      heroLine: "Collez un message avant de payer, d'ouvrir un lien ou de partager un code.",
      paste: "Coller et vérifier",
      pasteFallback: "Rien à coller pour l'instant. Saisissez le message, ou collez-le.",
      screenshot: "Vérifier une capture d'écran",
      payRow: "Vérifier avant de payer",
      intro: {
        title: "À quoi ça sert",
        points: [
          "Repère les arnaques bancaires, de colis et de faux gains telles qu'on les reçoit à Maurice.",
          "Comprend le kreol, le français et l'anglais, même mélangés dans un même message.",
          "Les numéros de téléphone et de compte sont retirés sur votre téléphone, avant tout envoi.",
        ],
      },
      checkingLabel: "Analyse du message",
      checkingNote: "Cela peut prendre jusqu'à une minute. Vous pouvez laisser cet écran ouvert.",
      week: {
        title: "Cette semaine",
        checks: (n) => `${n} vérification${n === 1 ? "" : "s"}`,
        caught: (n) => ({ strong: `${n} arnaque${n === 1 ? "" : "s"}`, rest: n === 1 ? "détectée" : "détectées" }),
        nothing: "rien détecté",
      },
      practice: { title: "Entraînement", streak: (n) => `${n} jour${n === 1 ? "" : "s"} d'affilée`, start: "Commencer une série" },
      install: {
        body: "Gardez FraudLens sur votre écran d'accueil, pour l'avoir sous la main au prochain message.",
        add: "Ajouter à l'écran d'accueil",
        notNow: "Plus tard",
        iosTitle: "Sur iPhone",
        iosStep1: "Touchez le bouton Partager dans Safari.",
        iosStep2: "Choisissez « Sur l’écran d’accueil ».",
      },
      recent: {
        title: "Récent",
        empty: "Vos vérifications apparaîtront ici.",
        short: { safe: "Authentique", suspicious: "Prudence", scam: "Arnaque" },
      },
    },
    tools: {
      title: "Outils",
      batch: "Analyse groupée",
      batchHint: "Plusieurs à la fois",
      conversation: "Conversation",
      conversationHint: "Tout un échange",
      sandbox: "Simulation",
      sandboxHint: "S'entraîner sans risque",
    },
    settings: {
      title: "Réglages",
      theme: {
        title: "Apparence",
        system: "Système",
        light: "Clair",
        dark: "Sombre",
        note: "Système suit le réglage clair ou sombre de votre téléphone.",
      },
      languageTitle: "Langue",
      languageNote: "Change tous les écrans, et indique à l'analyse dans quelle langue répondre.",
      privacyTitle: "Confidentialité",
      privacyBody:
        "Les numéros de téléphone, adresses e-mail et numéros de compte sont retirés dans votre navigateur avant l'envoi du message pour analyse. Vos vérifications restent sur cet appareil.",
      aboutTitle: "À propos",
      aboutBody: "FraudLens vous aide à repérer une arnaque avant de payer, d'ouvrir un lien ou de partager un code. Conçu à Maurice, pour Maurice.",
      teamLogoAlt: "Logo de Dhruv and Friends",
    },
    trends: {
      title: "Arnaques connues à Maurice",
      knownFormats: "Formats connus",
      intro:
        "Les formats d'arnaque assez souvent signalés à Maurice pour être reconnus du premier coup d'œil, ainsi que ce que FraudLens a réellement vu signalé ci-dessous.",
      categories: [
        {
          title: "SMS usurpant une banque",
          body: "Des messages se faisant passer pour MCB, SBM, Absa Mauritius ou Bank One, annonçant que votre compte est suspendu ou qu'un virement doit être confirmé d'urgence.",
          example: "« Alerte MCB : votre compte a été suspendu. Vérifiez maintenant sur mcb-secure.top »",
        },
        {
          title: "Arnaques aux prix télécom",
          body: "De faux messages My.t ou Emtel prétendant que vous avez gagné des données, du crédit ou de l'argent, vous poussant à cliquer sur un lien ou appeler un numéro surtaxé.",
          example: "« Félicitations ! Votre numéro a gagné Rs 25 000 chez My.t. Réclamez maintenant : myt-prize.win »",
        },
        {
          title: "Fraude au mobile money",
          body: "Un appelant se faisant passer pour un agent mobile money demande votre code PIN ou OTP pour « annuler » un mauvais paiement ou « mettre à niveau » votre compte.",
          example: "« Ici le support MCB Juice. Partagez le code reçu pour annuler le mauvais virement. »",
        },
      ],
      footerNote:
        "La liste ci-dessus est une référence, pas un flux en direct. Les chiffres ci-dessous sont l'usage réel de FraudLens, de vraies vérifications et signalements, pas un jeu de données de démonstration.",
      live: {
        heading: "Ce que FraudLens a réellement observé",
        reportedSenders: (n) => (n === 1 ? "1 expéditeur signalé" : `${n} expéditeurs signalés`),
        campaigns: (n) => (n === 1 ? "1 schéma suivi" : `${n} schémas suivis`),
        topSendersTitle: "Expéditeurs les plus signalés",
        topCampaignsTitle: "Schémas les plus observés",
        reports: (n) => (n === 1 ? "1 signalement" : `${n} signalements`),
        messages: (n) => (n === 1 ? "1 vérification" : `${n} vérifications`),
        empty: "Pas encore assez d'activité, vérifiez un message pour être le premier.",
        loading: "Chargement…",
        error: "Impossible de charger ceci pour le moment.",
      },
    },
    conversation: CONVERSATION_FR,
    result: {
      journey: JOURNEY_FR,
      investigate: {
        heading: "FraudLens a vérifié",
        messageRead: "Message lu",
        claimedIdentity: (name) => `Institution revendiquée : ${name}`,
        linksChecked: "Liens vérifiés par rapport aux domaines bancaires et télécoms connus",
        linkFlagged: (host) => `Lien suspect détecté : ${host}`,
        identityChecked: "Identité de l'expéditeur vérifiée",
        identityMismatch: "Incohérence d'identité détectée",
        communityNew: "Jamais signalé auparavant",
        communityFlagged: (n) => (n === 1 ? "Déjà signalé par un autre utilisateur" : `Déjà signalé par ${n} autres utilisateurs`),
        stageIdentified: (stage) => `Étape de l'arnaque identifiée : ${stage}`,
        campaignNew: "Nouveau schéma, aucune campagne correspondante pour l'instant",
        campaignMatched: "Correspond à une campagne d'arnaque connue",
      },
      networkLink: "Voir le réseau de fraude",
      title: "Résultat",
      fromSender: (s) => `SMS de ${s}`,
      back: "Retour",
      warningSigns: (n) =>
        n === 0 ? "Aucun signal d'alerte" : n === 1 ? "1 signal d'alerte" : `${n} signaux d'alerte`,
      risk: (s) => `Risque ${s} / 100`,
      hero: {
        riskScore: "Score de risque",
        outOf: "/ 100",
        warningSignsLabel: "Signaux d'alerte",
        signsFound: (n) => `${n} trouvé${n === 1 ? "" : "s"}`,
        linkMadeLabel: "Lien créé",
        daysAgo: (n) => (n === 0 ? "aujourd'hui" : n === 1 ? "il y a 1 jour" : `il y a ${n} jours`),
      },
      whatsWrong: "Ce qui ne va pas",
      signsUnit: (n) => (n === 1 ? "signal" : "signaux"),
      theLink: "Le lien",
      daysOld: (n) => (n === 1 ? "jour d'ancienneté" : "jours d'ancienneté"),
      realSite: (d) => `Vrai site : ${d}`,
      linksTitle: "Liens",
      linksToTap: () => "à ouvrir",
      noLinkBody: "Rien ici ne peut ouvrir une fausse page.",
      scamAdvice: "Ne payez pas, n'ouvrez pas le lien et ne partagez jamais un code reçu sur votre téléphone.",
      messageYouSent: "Le message envoyé",
      whyTitle: "Pourquoi c'est suspect",
      signalTitles: {
        sender_mismatch: "L'expéditeur n'est pas celui qu'il prétend être",
        lookalike_url: "Le lien n'est pas celui de la banque",
        urgency_language: "Il vous presse",
        spoofed_identity: "Il se fait passer pour quelqu'un de confiance",
        credential_request: "Il demande un code ou des informations personnelles",
        payment_request: "Il vous demande de payer ou d'envoyer de l'argent",
        prize_offer: "Il promet quelque chose de trop beau pour être vrai",
        secrecy: "Il vous demande de garder le secret",
      },
      genericSignal: "Quelque chose cloche",
      severity: { low: "Faible", medium: "Moyen", high: "Élevé" },
      xrayHint: "Touchez une phrase surlignée pour voir pourquoi elle a été signalée.",
      identity: {
        title: "Revendiqué vs. réel",
        claimsToBe: "Prétend être",
        recognized: "Institution reconnue",
        linksTo: "Mais le lien mène à",
        paysTo: "Mais le paiement va à",
        officialSite: "Site officiel",
        unverified: "Non vérifié",
        caveat: "Une ressemblance ne prouve pas qu'un lien ou un compte est authentique.",
      },
      evidence: {
        title: "Pourquoi FraudLens a signalé ceci",
        aiTitle: "Analyse par l'IA",
        deterministicTitle: "Vérifications déterministes",
        communityTitle: "Intelligence communautaire",
        communityLine: (n) => (n === 1 ? "Signalé par d'autres 1 fois" : `Signalé par d'autres ${n} fois`),
        sourcesAgree: (n) => `${n} sources de preuves indépendantes concordent`,
      },
      lookalikeDomain: (h, d) => `${h} ressemble à ${d}, mais ce n'est pas le vrai site.`,
      lookalikeBrand: (h, b) => `${h} utilise le nom ${b}, mais ce n'est pas un vrai site ${b}.`,
      linkCheck: {
        title: "Vérification du lien",
        linkInMessage: "Lien dans le message",
        imitates: "Imite",
        domainAge: "Âge du domaine",
        domainAgeValue: (d) => (d < 1 ? "Créé aujourd'hui" : d === 1 ? "1 jour" : `${d} jours`),
        reportedByOthers: "Signalé par d'autres",
        reportedValue: (n) => `${n} fois`,
      },
      whatToDoTitle: "Que faire maintenant",
      steps: {
        dont_open_or_reply: "N'ouvrez pas le lien et ne répondez pas.",
        block_sender: "Bloquez l'expéditeur pour qu'il ne puisse plus vous contacter.",
        report_to_bank: "Prévenez le service fraude de votre banque, au numéro imprimé sur votre carte.",
        verify_official:
          "Vérifiez directement auprès de l'entreprise, via son application ou son site officiel. N'utilisez pas les coordonnées du message.",
        dont_share_code: "Ne partagez jamais un code reçu sur votre téléphone, quel que soit le demandeur.",
        call_bank_card: "En cas de doute, appelez votre banque au numéro imprimé sur votre carte.",
        delete_and_report: "Supprimez le message et signalez-le.",
      },
      whatWeCheckedTitle: "Ce que nous avons vérifié",
      checks: {
        no_link: "Aucun lien, rien sur quoi cliquer",
        no_lookalike: "Aucun lien imitant une banque ou un opérateur",
        informs_not_asks: "Il vous informe au lieu de vous demander d'agir",
        last_four_only: "Il n'affiche que les 4 derniers chiffres, comme une vraie banque",
        no_pressure: "Pas d'urgence, pas de code demandé, pas de secret",
      },
      checksShort: {
        no_link: "Aucun lien",
        no_lookalike: "Aucun faux lien",
        informs_not_asks: "Rien à faire",
        last_four_only: "4 derniers chiffres",
        no_pressure: "Ni code ni urgence",
      },
      safeCaveat:
        "Nous ne pouvons pas garantir qu'un message est authentique. S'il y a de l'argent en jeu et le moindre doute, appelez votre banque au numéro indiqué sur votre carte.",
      report: {
        reportSender: "Signaler cet expéditeur",
        reportMessage: "Signaler ce message",
        senderLabel: "Qui l'a envoyé ?",
        senderPlaceholder: "Numéro ou nom",
        submit: "Envoyer le signalement",
        sending: "Envoi…",
        done: (n) => (n > 1 ? `Signalé. ${n} signalements pour cet expéditeur.` : "Signalé. Merci d'avertir les autres."),
        failed: "Le signalement n'a pas pu être envoyé. Veuillez réessayer.",
        note: "Signaler partage le numéro de l'expéditeur avec FraudLens pour avertir les autres.",
      },
      sentTitle: "Ce qui a été envoyé pour analyse",
      sentBody:
        "Seule cette version a quitté votre téléphone. Les numéros de téléphone, e-mails et numéros de compte ont d'abord été remplacés.",
      sentBodyScreenshot:
        "Votre capture a été envoyée à notre serveur pour lire le texte, avec tout son contenu visible. Votre résultat repose uniquement sur cette version masquée du texte.",
      aiSource: {
        label: "Analysé par",
        local: "Modèle IA local (auto-hébergé, sur l'appareil)",
        fallback: "IA de secours dans le cloud ({provider})",
        unavailable: "IA indisponible, vérifications déterministes uniquement",
      },
      checkAnother: "Vérifier un autre message",
      missingTitle: "Aucun résultat",
      missingBody: "Collez un message dans l'onglet Vérifier pour voir un résultat ici.",
    },
    replay: {
      title: "Fraud Replay",
      subtitle: "Comment ce message a été conçu pour fonctionner, raconté comme une histoire plutôt qu'un rapport.",
      openReplay: "Voir comment fonctionne cette arnaque",
      back: "Retour au résultat",
      stepContact: "Le contact",
      stepWanted: "Ce qu'on voulait de vous",
      stepJourney: "Vers où cela se dirige",
      experienceSafely: "Vivre cela en sécurité",
      stepPattern: "Le schéma plus large",
      patternMatched: (reports, senders, domains) =>
        `Correspond à des signalements antérieurs : ${reports} signalement${reports === 1 ? "" : "s"} auprès de ${senders} expéditeur${senders === 1 ? "" : "s"} et ${domains} domaine${domains === 1 ? "" : "s"}.`,
      stepStop: "Arrêtez-vous ici",
      belief: {
        sender_mismatch: "Un message inspire plus confiance quand il semble venir d'un numéro ou d'un compte que vous reconnaissez.",
        lookalike_url: "Un lien presque correct est facile à manquer quand on va vite.",
        urgency_language: "L'urgence réduit le temps que vous prendriez normalement pour vérifier.",
        spoofed_identity: "Emprunter un nom de confiance rend la demande crédible.",
        credential_request: "Un code ou un mot de passe peut sembler anodin à partager quand la demande paraît habituelle.",
        payment_request: "Présenter cela comme des frais ou un remboursement rend le paiement naturel.",
        prize_offer: "Une récompense inattendue baisse votre vigilance avant que vous vérifiiez qui demande vraiment.",
        secrecy: "Demander la discrétion empêche quelqu'un d'autre de repérer la supercherie.",
      },
    },
    simple: {
      turnOn: "Mode simple",
      turnOff: "Voir tous les détails",
      stopScam: "N'envoyez pas d'argent",
      stopSuspicious: "Soyez prudent",
      claims: (name) => `Ce message dit venir de ${name}.`,
      but: "Mais",
      issueFallback: "FraudLens a trouvé des signaux d'alerte dans ce message.",
      readAloud: "Lire à voix haute",
      stopReading: "Arrêter la lecture",
    },
    card: {
      cardTitle: "Vérification de sécurité FraudLens",
      whyHeading: "Pourquoi nous sommes préoccupés",
      helpMeExplain: "Aidez-moi à expliquer",
      share: "Partager",
      copyText: "Copier le texte",
      copied: "Copié",
    },
    learn: {
      headline: "Apprenez à les repérer",
      streak: (d) => `${d} jours d'affilée`,
      cards: {
        todayTitle: "Aujourd'hui",
        todayCount: (done, goal) => `${done} sur ${goal}`,
        more: (n) => `Encore ${n} pour garder votre série`,
        doneToday: "L'entraînement du jour est fait",
        streakTitle: "Série",
        days: (n) => (n === 1 ? "jour" : "jours"),
        noStreak: "Répondez à 5 pour commencer",
      },
      quizLabel: "Arnaque ou authentique ?",
      scam: "Arnaque",
      genuine: "Authentique",
      progress: (n, t, k) => `Question ${n} sur ${t} · ${k} bonne${k > 1 ? "s" : ""} réponse${k > 1 ? "s" : ""} jusqu'ici`,
      correct: "Exact.",
      incorrect: "Pas tout à fait.",
      isScam: "C'est une arnaque.",
      isGenuine: "Ce message est authentique.",
      whyLabel: "Pourquoi",
      inEnglish: "En anglais",
      next: "Suivant",
      seeScore: "Voir mon score",
      scoreLabel: "Votre score",
      scoreLine: (k, t) => `Vous en avez repéré ${k} sur ${t}.`,
      scoreComment: (k, t) =>
        k === t
          ? "Parfait. Vous les repéreriez aussi dans la vraie vie."
          : k / t >= 0.75
            ? "Bon œil. Rejouez pour voir d'autres messages."
            : "Ils sont piégeux exprès. Rejouez en guettant les signaux d'alerte.",
      best: (b, t) => `Votre record : ${b} / ${t}`,
      playAgain: "Rejouer",
      syntheticNote:
        "Les messages d'entraînement et les exemples de cette page sont fictifs, tirés de notre jeu de données en kreol. Les noms comme OceanBank sont inventés.",
      trendsTitle: "Arnaques courantes",
      trends: {
        parcel_fee: {
          tag: "Frais de colis",
          body: "Un SMS dit que votre colis est bloqué en douane et demande de petits frais via un lien. Les vrais transporteurs ne font pas payer par lien SMS : vérifiez sur leur propre site.",
        },
        fake_relative: {
          tag: "Faux proche",
          body: "Quelqu'un se présente comme votre enfant ou un proche avec un nouveau numéro, a besoin d'argent en urgence et vous demande de n'en parler à personne. Appelez-le sur le numéro que vous connaissez avant d'envoyer quoi que ce soit.",
        },
        investment: {
          tag: "Investissement",
          body: "Un inconnu promet de doubler ou tripler votre argent en quelques jours, sans risque. Les rendements garantis n'existent pas : le dépôt, c'est l'arnaque.",
        },
      },
      languageName: { en: "anglais", fr: "français", kreol: "kreol" },
      fewItems: (l) => `D'autres messages d'entraînement en ${l} arrivent bientôt.`,
      offerOther: (l) => `S'entraîner en ${l}`,
      kreolMixNote:
        "Les messages en kreol mélangent souvent un peu d'anglais ou de français, comme les vrais SMS à Maurice.",
      practisingIn: (l) => `Entraînement en ${l}`,
      dailyProgress: (a, g) => `Aujourd'hui : ${a} sur ${g} pour votre série`,
      dailyDone: "L'entraînement du jour est fait.",
      celebrate: {
        title: (n) => `Série de ${n} jour${n > 1 ? "s" : ""}`,
        dayOne: "Premier jour validé. Revenez demain pour lancer une série.",
        streakLine: (n) => `Vous vous êtes entraîné ${n} jours d'affilée.`,
        score: (r, t) => `Aujourd'hui : ${r} sur ${t} bonnes réponses`,
        mistakesTitle: "À revoir",
        allRight: "Tout juste aujourd'hui. Rien à revoir.",
        keepGoing: "Continuer",
      },
      dev: { title: "Outils de dev", reset: "Réinitialiser la série", seed: "Simuler 2 jours faits" },
    },
    safepay: {
      title: "Avant de payer",
      intro:
        "Quelques questions rapides avant d'envoyer de l'argent. Nous vérifions ce que nous pouvons et vous disons quoi faire ensuite.",
      requesterLabel: "Qui vous demande de payer ?",
      requesterPlaceholder: "ex. MCB, un transporteur, une connaissance",
      channelLabel: "Comment vous ont-ils contacté ?",
      channelPlaceholder: "ex. SMS, WhatsApp, appel téléphonique",
      recipientLabel: "Qui payez-vous ?",
      recipientPlaceholder: "Numéro de téléphone, numéro de compte ou nom",
      amountLabel: "Montant (optionnel)",
      amountPlaceholder: "ex. Rs 12 500",
      amountHeading: "Montant",
      messageLabel: "Message reçu (optionnel, mais très utile)",
      messagePlaceholder: "Collez le message qui vous a demandé de payer, si vous en avez un",
      submit: "Vérifier avant de payer",
      missingInput: "Indiquez qui vous le demande, ou collez le message, pour que nous ayons quelque chose à vérifier.",
      pauseTitle: "Faites une pause avant de payer",
      okTitle: "Aucun signal d'alerte trouvé",
      okBody:
        "Nous n'avons trouvé aucune raison précise de vous inquiéter, mais nous ne pouvons pas confirmer que cette demande est authentique. En cas de doute, vérifiez directement auprès de l'organisation via un numéro ou une application que vous connaissez déjà.",
      recipientReportedLine: (n) =>
        n === 1 ? "Ce destinataire a été signalé 1 fois" : `Ce destinataire a été signalé ${n} fois`,
      verifyCta: "Vérifier via un canal officiel",
      reportCta: "Signaler ceci",
      checkAnother: "Vérifier un autre paiement",
      back: "Vérifier un message à la place",
    },
  },

  kreol: {
    languageSwitcher: "Langaz",
    headline: "Ou finn gagn enn mesaz lor larzan?",
    subline:
      "Kol li isi avan ou pey, klik ouswa partaz enn kod. Nou pou montre ou seki paret pa bon ek kifer.",
    home: DRAFT_KREOL({
      tagline: "Trouv eskrokri la avan li arive.",
      pitch:
        "FraudLens pa zis dir enn mesaz paret sispe. Li montre ou exakteman kifer, dan enn langaz senp, avan ou pey, klike ouswa partaz enn kod.",
      bullets: [
        "Get exakteman ki bann mo ek lien finn deklans enn lalert.",
        "Li mars an Angle, Franse ek Kreol, mem kan zot melanze.",
        "Li verifie tou lien kont bann vre domenn labank ek telekom Morisien.",
        "Verifie enn mesaz, enn kopi lekran, ouswa enn pelman ki ou lor pwen fer.",
      ],
      payCta: "Mo lor pwen pey",
      payCtaSub: "Fer verifikasion avan ou avoy larzan, pa apre.",
    }),
    messageLabel: "Mesaz la",
    placeholder: "Kol text SMS, WhatsApp ouswa email la isi...",
    submit: "Verifie sa mesaz la",
    // Stage 0 reuses the reviewed "Pe verifie…" / "Pe lir text la…"; the rest is new and unreviewed.
    wait: {
      check: ["Pe verifie…", "Pe rod bann siny danze…", "AI la pe lir li bien…", "Pe travay ankor, sa kapav pran de-trwa minit lor nou sistem aktiel."],
      checkShort: [
        "Pe verifie…",
        "Pe rod siny…",
        "Pe lir bien…",
        "Pe travay ankor…",
      ],
      screenshot: [
        "Pe lir text la…",
        "Pe tir text la…",
        "Pe lir text la bien…",
        "Pe travay ankor, sa kapav pran de-trwa minit lor nou sistem aktiel.",
      ],
      progressLabel: "Progre",
      cancel: "Anile",
    },
    uploadScreenshot: "Met enn screenshot",
    screenshotLabel: "Screenshot",
    // Screenshot upload: Kreol drafted, pending the frontend owner's read-through.
    imagePrivacyNote: 
      "Screenshot la avoye ar nou server parey kouma li ete, avek nom ek nimero ankor vizib. Server la lir text la ek tir nimero telefonn, email ek nimero kont avan nanye analize. Ou rezilta baze zis lor text la apre sa bann detay-la finn tire, apre ou finn relir li ek pes Verifie.",
    shot: {
      remove: "Tir screenshot la",
      alt: "Ou screenshot",
      extracted: "Text depi ou screenshot finn azoute. Relir li ek koriz seki pa bon, apre pes Verifie.",
      typeInstead: "Ekrir li plito",
    },
    privacyNote: "Nimero telefonn, email ek nimero kont tire avan nanye analize.",
    telegram: "Ouswa avoy li ar @FraudLensBot lor Telegram.",
    recentTitle: "Dernie verifikasion",
    recentEmpty: "Pa ankor ena nanye. Ou sink dernie verifikasion pou paret isi.",
    charCount: (n, max) => `${fmt(n, "fr")} / ${fmt(max, "fr")}`,
    tooLong: "Tro long. Pa depas 5 000 karakter.",
    retry: "Esey ankor",
    errors: {
      validationTitle: "Nou pa finn kapav verifie",
      validation: {
        message_empty: "Kol enn mesaz avan, apre pes verifie.",
        message_too_long: "Mesaz la tro long. Pa depas 5 000 karakter.",
        batch_empty: "Azout omwin enn mesaz.",
        batch_too_many: "Ou kapav verifie ziska 50 mesaz enn kou.",
        batch_item_empty: "Enn mesaz vid.",
        batch_item_too_long: "Enn mesaz depas 5 000 karakter.",
        sender_empty: "Met nimero ouswa nom sa kinn avoy li.",
        image_missing: "Swazir enn kaptir ekran pou anvoye.",
        image_invalid: "Fisie la pa enn imaz PNG, JPEG, ouswa WEBP.",
        image_too_large: "Imaz la tro gran. Pa depas 5 Mo.",
        image_unreadable: "Nou pa finn kapav lir sa imaz la. Esey enn lot fisie.",
        image_no_text: "Nou pa finn trouv okenn text lizib dan sa kaptir ekran la.",
        image_text_too_long: 
          "Ena tro boukou text dan sa screenshot la pou nou verifie enn sel kou. Koup li pou gard zis mesaz la, ouswa kol text la.",
        invalid: "Ena enn problem ar sa mesaz la. Get li ek esey ankor.",
      },
      llmTitle: "Nou servis okipe",
      llm: "Servis analiz la pa finn reponn sa fwa la. Ou mesaz la ankor la, esey ankor dan enn ti moman.",
      networkTitle: "Pa kapav konekte ar FraudLens",
      network: "Pa kapav kontak servis verifikasion la aster. Get ou koneksion ek esey ankor.",
      timeoutTitle: "Sa inn pran tro boukou letan",
      timeout: "Verifikasion la inn pran tro boukou letan, nou finn aret li. Esey ankor, souvan li pli vit dezyem fwa.",
      ocrTitle: "Nou pa finn kapav lir sa imaz la",
      ocr: "Enn problem finn arive pandan nou ti pe lir text la. Esey ankor, ouswa ekrir mesaz la plito.",
      unexpectedTitle: "Ena enn problem",
      unexpected: "Nou finn gagn enn repons ki nou pa kapav lir. Esey ankor.",
    },
    relativeTime: (ms) =>
      relative(ms, { now: "aster la", min: "min", hour: "er", day: "zour", ago: (s) => `ena ${s}` }),
    tabs: {
      check: "Verifie",
      learn: "Aprann",
      trends: "Radar",
      settings: DRAFT_KREOL("Paramet"),
      newCheck: DRAFT_KREOL("Verifie enn nouvo mesaz"),
    },
    check: DRAFT_KREOL({
      greeting: (h: number) => (h < 12 ? "Bonzour" : h < 18 ? "Bon apremidi" : "Bonswar"),
      question: "Eski sa enn eskrokri?",
      heroLine: "Kol enn mesaz avan ou pey, klik enn lien ouswa partaz enn kod.",
      paste: "Kol ek verifie",
      pasteFallback: "Nanye pou kole ankor. Tap mesaz la, ouswa kol li isi.",
      screenshot: "Verifie enn kopi lekran",
      payRow: "Verifie avan ou pey",
      intro: {
        title: "Ki sa fer",
        points: [
          "Li trouv bann eskrokri labank, koli ek pri kouma bann ki avoye dan Moris.",
          "Li lir Kreol, Franse ek Angle, mem kan enn mesaz melanz zot.",
          "Nimero telefonn ek nimero kont tire lor ou telefonn, avan nanye avoye.",
        ],
      },
      checkingLabel: "Pe verifie mesaz la",
      checkingNote: "Sa kapav pran ziska enn minit. Ou kapav les sa lekran la ouver.",
      week: {
        title: "Sa semenn la",
        checks: (n: number) => `${n} verifikasion`,
        caught: (n: number) => ({ strong: `${n} eskrokri`, rest: "trouve" }),
        nothing: "nanye pa finn trouve",
      },
      practice: {
        title: "Antrennman",
        streak: (n: number) => `${n} zour ki swiv`,
        start: "Koumans enn seri",
      },
      install: {
        body: "Gard FraudLens lor ou lekran akey, pou li la kan prosen mesaz arive.",
        add: "Azout lor lekran akey",
        notNow: "Pa aster",
        iosTitle: "Lor iPhone",
        iosStep1: "Tap bouton Partaz dan Safari.",
        iosStep2: 'Swazir "Add to Home Screen".',
      },
      recent: {
        title: "Dernie",
        empty: "Ou bann verifikasion pou paret isi.",
        short: { safe: "Vre", suspicious: "Atansion", scam: "Eskrokri" },
      },
    }),
    tools: DRAFT_KREOL({
      title: "Zouti",
      batch: "Verifie an gro",
      batchHint: "Plizier enn sel kou",
      conversation: "Konversasion",
      conversationHint: "Tou enn diskision",
      sandbox: "Similasion",
      sandboxHint: "Antrenn ou san risk",
    }),
    settings: DRAFT_KREOL({
      title: "Paramet",
      theme: {
        title: "Laparans",
        system: "Sistem",
        light: "Kler",
        dark: "Fonse",
        note: "Sistem swiv reglaz kler ouswa fonse ou telefonn limem.",
      },
      languageTitle: "Langaz",
      languageNote: "Li sanz tou bann lekran, ek li dir lanaliz dan ki langaz pou reponn.",
      privacyTitle: "Konfidansialite",
      privacyBody:
        "Nimero telefonn, email ek nimero kont tire dan ou navigater avan enn mesaz avoye pou lanaliz. Ou bann verifikasion res lor sa aparey la selman.",
      aboutTitle: "Lor nou",
      aboutBody:
        "FraudLens ed ou rekonet enn mesaz eskrokri avan ou pey, klik enn lien ouswa partaz enn kod. Fer dan Moris, pou Moris.",
      teamLogoAlt: "Logo Dhruv and Friends",
    }),
    trends: {
      title: "Bann eskrokri konplet dan Moris",
      knownFormats: DRAFT_KREOL("Bann format koni"),
      intro:
        "FraudLens pankor ena enn fli rapor an direk, alor sa se pa enn klasman an tanrsyel, se bann format eskrokri ki rapote ase souvan dan Moris pou ou rekonet zot dan enn kou lizie.",
      categories: [
        {
          title: "SMS ki imit enn labank",
          body: "Bann mesaz ki fer krwar zot MCB, SBM, Absa Mauritius ouswa Bank One, ki dir ou kont finn sispann ouswa enn transfer bizin konfirme dirzans.",
          example: "\"Alert MCB: Ou kont finn sispann. Verifie aster lor mcb-secure.top\"",
        },
        {
          title: "Eskrokri pri telekom",
          body: "Fos mesaz My.t ouswa Emtel ki dir ou finn gagn data, kredi ouswa larzan, ki pouse ou pou klik enn lien ouswa apel enn nimero pey.",
          example: "\"Felisitasion! Ou nimero finn gagn Rs 25 000 kot My.t. Reklam aster: myt-prize.win\"",
        },
        {
          title: "Fraud mobile money",
          body: 'Enn dimoun ki fer krwar li enn azan mobile money dimann ou PIN ouswa OTP pou "aret" enn move peyman ouswa "amelior" ou kont.',
          example: "\"Sa se sipor MCB Juice. Partaz kod la pou nou anile move transfer la.\"",
        },
      ],
      footerNote:
        "Seki pli pros ar enn vre tandans zordi: kan ou verifie enn mesaz, lekran rezilta montre si lezot inn deza rapor sa kinn avoy li la.",
      live: DRAFT_KREOL({
        heading: "What FraudLens has actually seen",
        reportedSenders: (n: number) => (n === 1 ? "1 sender reported" : `${n} senders reported`),
        campaigns: (n: number) => (n === 1 ? "1 pattern tracked" : `${n} patterns tracked`),
        topSendersTitle: "Most-reported senders",
        topCampaignsTitle: "Most-observed patterns",
        reports: (n: number) => (n === 1 ? "1 report" : `${n} reports`),
        messages: (n: number) => (n === 1 ? "1 check" : `${n} checks`),
        empty: "Not enough activity yet: check a message to be the first.",
        loading: "Loading…",
        error: "Couldn't load this right now.",
      }),
    },
    // Result screen: reviewed by the frontend owner.
    conversation: DRAFT_KREOL({
      title: "Get konversasion la deroule",
      intro: "Azout bann mesaz dan lord ki ou finn gagn zot. Swiv bann siny danze pandan ki konversasion la avanse.",
      thread: "Konversasion",
      empty: "Koumans ar premie mesaz ki ou finn gagne.",
      add: "Prosen mesaz",
      submit: "Analiz mesaz la",
      reset: "Efas konversasion",
      progress: "Etap pli lwen detekte",
      pending:
        "Azout enn mesaz pou get so etap. Sak mesaz analize separeman; diskision la montre etap pli lwen ki finn detekte.",
      message: "Mesaz",
      unknownStage: "Etap pa idantifie",
      verdicts: { safe: "Pena siny danze", suspicious: "Sispe", scam: "Eskrokri" },
    }),
    result: {
      journey: DRAFT_KREOL({
        title: "Parkour eskrokri",
        whatNextTitle: "Seki kapav arive apre",
        youAreHere: "Ou isi",
        caveat:
          "Enn progresion posib, pa enn predision. Sa mesaz la pa konfirm bann etap avan.",
        labels: {
          INITIAL_CONTACT: "Premie kontak",
          TRUST_BUILDING: "Pe gagn ou konfians",
          AUTHORITY_CLAIM: "Pe fer krwar li ena lotorite",
          URGENCY: "Pe met presion letan",
          CREDENTIAL_REQUEST: "Pe dimann ou bann idantifian",
          OTP_REQUEST: "Pe dimann enn kod OTP",
          PAYMENT_REQUEST: "Pe dimann enn pelman",
          PAYMENT_PRESSURE: "Pe fors ou pou pey",
          ACCOUNT_TAKEOVER: "Pe pran kontrol ou kont",
        },
      }),
      investigate: DRAFT_KREOL({
        heading: "FraudLens finn verifie",
        messageRead: "Mesaz la lir",
        claimedIdentity: (name: string) => `Lenstitision ki li dir: ${name}`,
        linksChecked: "Bann lien verifie kont domenn labank ek telekom koni",
        linkFlagged: (host: string) => `Lien sispe trouve: ${host}`,
        identityChecked: "Idantite sann ki avoye verifie",
        identityMismatch: "Idantite pa koresponn",
        communityNew: "Pa finn rapporte avan",
        communityFlagged: (n: number) =>
          n === 1 ? "Rapporte par enn lot itilizater avan" : `Rapporte par ${n} lezot itilizater avan`,
        stageIdentified: (stage: string) => `Etap eskrokri idantifie: ${stage}`,
        campaignNew: "Nouvo model: pena kanpagn ki koresponn ankor",
        campaignMatched: "Li koresponn ar enn kanpagn eskrokri koni",
      }),
      networkLink: DRAFT_KREOL("Get rezo eskrokri"),
      title: "Rezilta",
      fromSender: (s) => `SMS depi ${s}`,
      back: "Retour",
      warningSigns: (n) => (n === 0 ? "Pena okenn siny danze" : `${n} siny danze`),
      risk: (s) => `Risk ${s} / 100`,
      hero: DRAFT_KREOL({
        riskScore: "Nivo risk",
        outOf: "/ 100",
        warningSignsLabel: "Siny danze",
        signsFound: (n: number) => `${n} trouve`,
        linkMadeLabel: "Lien fer",
        daysAgo: (n: number) => (n === 0 ? "zordi" : n === 1 ? "ena 1 zour" : `ena ${n} zour`),
      }),
      whatsWrong: DRAFT_KREOL("Ki pa bon"),
      signsUnit: (n: number) => (n === 1 ? "siny" : "siny"),
      theLink: DRAFT_KREOL("Lien la"),
      daysOld: (n: number) => (n === 1 ? "zour" : "zour"),
      realSite: (d: string) => `Vre sit: ${d}`,
      linksTitle: DRAFT_KREOL("Bann lien"),
      linksToTap: DRAFT_KREOL(() => "pou klike"),
      noLinkBody: DRAFT_KREOL("Nanye isi pa kapav ouver enn fos paz."),
      scamAdvice: "Pa pey, pa ouver lien la, ek zame partaz enn kod ki ou gagn lor ou telefonn.",
      messageYouSent: "Mesaz ki ou finn avoye",
      whyTitle: "Kifer sa paret pa bon",
      signalTitles: {
        sender_mismatch: "Sa kinn avoy li pa seki li dir li ete",
        lookalike_url: "Lien la pa pou labank",
        urgency_language: "Li pe fors ou pou depese",
        spoofed_identity: "Li pe fer krwar li enn dimoun ou fer konfians",
        credential_request: "Li pe dimann enn kod ouswa ou detay personel",
        payment_request: "Li pe dimann ou pey ouswa avoy larzan",
        prize_offer: "Li pe promet enn zafer ki tro bon pou vre",
        secrecy: "Li pe dir ou gard sa sekre",
      },
      genericSignal: "Ena kiksoz ki pa bon",
      severity: { low: "Ba", medium: "Mwayen", high: "O" },
      xrayHint: DRAFT_KREOL("Tap lor enn fraz sirliyne pou get kifer li finn siyale."),
      identity: DRAFT_KREOL({
        title: "Seki li dir kont seki li ete",
        claimsToBe: "Li dir li",
        recognized: "Lenstitision rekonet",
        linksTo: "Me lien la ale lor",
        paysTo: "Me pelman la ale kot",
        officialSite: "Sit ofisiel",
        unverified: "Pa verifie",
        caveat: "Parski li resanble, sa pa prouve ki enn lien ouswa enn kont vre.",
      }),
      evidence: DRAFT_KREOL({
        title: "Kifer FraudLens finn siyal sa",
        aiTitle: "Lanaliz AI",
        deterministicTitle: "Verifikasion regleman",
        communityTitle: "Lenformasion kominote",
        communityLine: (n: number) => (n === 1 ? "Rapporte par lezot 1 fwa" : `Rapporte par lezot ${n} fwa`),
        sourcesAgree: (n: number) => `${n} sours prev endepandan dakor`,
      }),
      lookalikeDomain: (h, d) => `${h} resanble ${d}, me se pa vre sit la.`,
      lookalikeBrand: (h, b) => `${h} servi nom ${b}, me se pa enn vre sit ${b}.`,
      linkCheck: {
        title: "Verifikasion lien",
        linkInMessage: "Lien dan mesaz la",
        imitates: "Pe imit",
        domainAge: "Laz domenn",
        domainAgeValue: (d) => (d < 1 ? "Kree zordi" : `${d} zour`),
        reportedByOthers: "Lezot inn rapor li",
        reportedValue: (n) => `${n} fwa`,
      },
      whatToDoTitle: "Ki pou fer aster",
      steps: {
        dont_open_or_reply: "Pa ouver lien la ek pa reponn.",
        block_sender: "Blok sa kinn avoy li, pou li pa kapav kontak ou ankor.",
        report_to_bank: "Averti servis fraud ou labank, lor nimero ki enprime lor ou kart.",
        verify_official:
          "Verifie direk ar lakonpani, par so app ouswa so sit ofisiel. Pa servi kontak ki dan mesaz la.",
        dont_share_code: "Zame partaz enn kod ki ou gagn lor ou telefonn, ninport kisannla ki dimande.",
        call_bank_card: "Si ou pe trakase, apel ou labank lor nimero ki enprime lor ou kart.",
        delete_and_report: "Efas mesaz la ek rapor li.",
      },
      whatWeCheckedTitle: "Seki nou finn verifie",
      checks: {
        no_link: "Pena lien, nanye pou klike",
        no_lookalike: "Okenn lien pa pe imit enn labank ouswa telekom",
        informs_not_asks: "Li pe dir ou kiksoz, li pa pe dimann ou fer kiksoz",
        last_four_only: "Li montre zis 4 dernie sif, parey kouma enn vre labank",
        no_pressure: "Pa presse, pa dimann kod, pa sekre",
      },
      checksShort: {
        no_link: "Pena lien",
        no_lookalike: "Pena fo lien",
        informs_not_asks: DRAFT_KREOL("Nanye pou fer"),
        last_four_only: DRAFT_KREOL("Zis 4 dernie sif"),
        no_pressure: DRAFT_KREOL("Pa dimann kod, pa presse"),
      },
      safeCaveat:
        "Nou pa kapav garanti ki enn mesaz vre. Si ena larzan ladan ek ou ena enn dout, apel ou labank lor nimero ki lor ou kart.",
      report: {
        reportSender: "Rapor sa kinn avoy li",
        reportMessage: "Rapor sa mesaz la",
        senderLabel: "Kisannla kinn avoy li?",
        senderPlaceholder: "Nimero ouswa nom",
        submit: "Avoy rapor la",
        sending: "Pe avoye…",
        done: (n) => (n > 1 ? `Rapor finn fer. ${n} rapor pou sa nimero la ziska aster.` : "Rapor finn fer. Mersi pou averti lezot."),
        failed: "Nou pa finn kapav avoy rapor la. Esey ankor.",
        note: "Kan ou rapor, nimero sa kinn avoy li partaze ar FraudLens pou averti lezot.",
      },
      sentTitle: "Seki finn avoye pou analiz",
      sentBody: "Zis sa version la ki finn kit ou telefonn. Nimero telefonn, email ek nimero kont finn ranplase avan.",
      sentBodyScreenshot:
        "Ou screenshot finn avoye ar nou server pou lir text la, avek tou seki ladan vizib. Ou rezilta baze zis lor sa version text-la kot detay personel finn tire.",
      aiSource: {
        label: "Analize par",
        local: "Model AI lokal (self-hosted, lor aparey)",
        fallback: "AI backup lor cloud ({provider})",
        unavailable: "AI pa disponib, zis verifikasion deterministik",
      },
      checkAnother: "Verifie enn lot mesaz",
      missingTitle: "Pena rezilta",
      missingBody: "Kol enn mesaz dan Verifie pou trouv enn rezilta isi.",
    },
    replay: DRAFT_KREOL({
      title: "Rekonstitision eskrokri",
      subtitle: "Kouma sa mesaz la finn fer pou marse, rakonte kouma enn zistwar olie enn rapor.",
      openReplay: "Get kouma sa eskrokri la marse",
      back: "Retourn lor rezilta",
      stepContact: "Kontak la",
      stepWanted: "Seki li ti pe rod kot ou",
      stepJourney: "Kot sa pe ale",
      experienceSafely: "Viv sa san risk",
      stepPattern: "Model pli larz",
      patternMatched: (reports: number, senders: number, domains: number) =>
        `Li koresponn ar bann rapor avan: ${reports} rapor lor ${senders} nimero ek ${domains} domenn.`,
      stepStop: "Aret la",
      belief: {
        sender_mismatch:
          "Enn mesaz paret pli fiab kan li sanble sorti kot enn nimero ouswa enn kont ki ou rekonet.",
        lookalike_url: "Enn lien ki preske bon fasil pou rate kan ou pe prese.",
        urgency_language: "Presion letan koup tan ki ou ti pou pran pou verifie.",
        spoofed_identity: "Servi enn nom ki dimounn fer konfians fer demann la paret ofisiel.",
        credential_request:
          "Enn kod ouswa enn modpas kapav paret san danze pou partaze kan demann la paret normal.",
        payment_request:
          "Prezant li kouma enn fre ouswa enn ranbursman fer pelman la paret kouma prosen etap normal.",
        prize_offer: "Enn rekonpans inatandi bes ou vizilans avan ou verifie kisannla pe dimande.",
        secrecy: "Kan dir ou gard sa sekre, personn lot pa kapav dekouver trik la.",
      },
    }),
    simple: DRAFT_KREOL({
      turnOn: "Mod senp",
      turnOff: "Montre tou detay",
      stopScam: "Pa avoy larzan ankor",
      stopSuspicious: "Fer atansion",
      claims: (name: string) => `Sa mesaz la dir li sorti kot ${name}.`,
      but: "Me",
      issueFallback: "FraudLens finn trouv bann siny danze dan sa mesaz la.",
      readAloud: "Lir sa afot",
      stopReading: "Aret lir",
    }),
    card: DRAFT_KREOL({
      cardTitle: "Verifikasion sekirite FraudLens",
      whyHeading: "Kifer nou inkiet",
      helpMeExplain: "Ed mwa explik sa",
      share: "Partaze",
      copyText: "Kopye text la",
      copied: "Kopie",
    }),
    // Learn tab: reviewed by the frontend owner.
    learn: {
      headline: "Aprann rekonet zot",
      streak: (d) => `${d} zour ki swiv`,
      cards: {
        todayTitle: "Zordi",
        todayCount: (done: number, goal: number) => `${done} lor ${goal}`,
        more: DRAFT_KREOL((n: number) => `Ankor ${n} pou gard ou seri`),
        doneToday: DRAFT_KREOL("Antrennman zordi fini"),
        streakTitle: DRAFT_KREOL("Seri"),
        days: (n: number) => (n === 1 ? "zour" : "zour"),
        noStreak: DRAFT_KREOL("Reponn 5 pou koumanse"),
      },
      quizLabel: "Eskrokri ouswa vre?",
      scam: "Eskrokri",
      genuine: "Vre",
      progress: (n, t, k) => `Kestion ${n} lor ${t} · ou finn gagn ${k} bon ziska aster`,
      correct: "Bon repons.",
      incorrect: "Pa bon.",
      isScam: "Sa enn eskrokri.",
      isGenuine: "Sa enn vre mesaz.",
      whyLabel: "Kifer",
      inEnglish: "An angle",
      next: "Swivan",
      seeScore: "Get ou skor",
      scoreLabel: "Ou skor",
      scoreLine: (k, t) => `Ou finn rekonet ${k} lor ${t}.`,
      scoreComment: (k, t) =>
        k === t
          ? "Parfe. Ou ti pou rekonet zot dan lavi reel osi."
          : k / t >= 0.75
            ? "Bon lizie. Zwe ankor pou gagn enn lot melanz."
            : "Sa bann-la difisil ekspre. Zwe ankor ek get bien bann siny danze.",
      best: (b, t) => `Ou pli bon skor: ${b} / ${t}`,
      playAgain: "Zwe ankor",
      syntheticNote: 
        "Bann mesaz pratik ek egzanp lor sa paz-la inventer, depi nou dataset Kreol. Nom kouma OceanBank pa egziste.",
      trendsTitle: "Bann kalite arnak kouran",
      trends: {
        parcel_fee: {
          tag: "Fre koli",
          body: "Enn SMS dir ou koli bloke ladwann ek demann ou pey enn ti fre atraver enn lien. Vre konpani livrezon pa pran fre par lien SMS, al get lor zot prop sit web plito.",
        },
        fake_relative: {
          tag: "Fos fami",
          body: "Enn dimounn dir li ou zanfan ouswa enn fami lor enn nouvo nimero, bizin larzan irzan, ek demann ou pa dir personn. Apel zot lor nimero ki ou deza ena avan ou avoy nanye.",
        },
        investment: {
          tag: "Investisman",
          body: "Enn etranze promet pou double ouswa triple ou larzan dan kek zour, san okenn risk. Profi garanti pa egziste: sa depo-la limem arnak la.",
        },
      },
      languageName: { en: "Angle", fr: "Franse", kreol: "Kreol" },
      fewItems: (l) => `Plis mesaz pratik an ${l} pe vini byento.`,
      offerOther: (l) => `Pratik an ${l} plito`,
      kreolMixNote: "Mesaz Kreol souvan melanz enn tigit Angle ouswa Franse, parey kouma vre SMS Moris.",
      practisingIn: (l) => `Pe pratik an ${l}`,
      dailyProgress: (a, g) => `Zordi: ${a} lor ${g} pou ou serie zour`,
      dailyDone: "Pratik zordi fini.",
      celebrate: {
        title: (n) => `${n} zour ki swiv`,
        dayOne: "Premie zour fini. Revini demin pou koumans enn serie.",
        streakLine: (n) => `Ou finn pratik ${n} zour ki swiv.`,
        score: (r, t) => `Zordi: ${r} lor ${t} bon`,
        mistakesTitle: "Get sa bann-la ankor",
        allRight: "Ou finn gagn tou bon zordi. Nanye pou relir.",
        keepGoing: "Kontinie",
      },
      dev: { title: "Zouti dev", reset: "Efas serie", seed: "Fer kouma si 2 zour fini" },
    },
    safepay: DRAFT_KREOL({
      title: "Avan ou pey",
      intro:
        "De-trwa kestion rapid avan ou avoy larzan. Nou pou verifie seki nou kapav ek dir ou ki pou fer apre.",
      requesterLabel: "Kisannla pe dimann ou pey?",
      requesterPlaceholder: "par ex. MCB, enn konpagni livrezon, enn dimounn ou konne",
      channelLabel: "Kouma zot finn kontakte ou?",
      channelPlaceholder: "par ex. SMS, WhatsApp, enn apel",
      recipientLabel: "Kisannla ou pe peye?",
      recipientPlaceholder: "Nimero telefonn, nimero kont ouswa nom",
      amountLabel: "Montan (opsionel)",
      amountPlaceholder: "par ex. Rs 12,500",
      amountHeading: "Montan",
      messageLabel: "Mesaz ki ou finn gagne (opsionel, me li ed boukou)",
      messagePlaceholder: "Kol mesaz ki finn dimann ou pey, si ou ena li",
      submit: "Verifie avan mo pey",
      missingInput: "Dir nou kisannla pe dimande, ouswa kol mesaz la, pou nou ena kiksoz pou verifie.",
      pauseTitle: "Aret enn kou avan ou pey",
      okTitle: "Pena siny danze trouve",
      okBody:
        "Nou pa finn trouv enn rezon presi pou inkiet, me nou pa kapav konfirm ki sa demann la vre. Si ou ena dout, verifie direk ar lorganizasion lor enn nimero ouswa enn app ki ou deza fer konfians.",
      recipientReportedLine: (n: number) =>
        n === 1 ? "Sa benefisier la finn rapporte 1 fwa" : `Sa benefisier la finn rapporte ${n} fwa`,
      verifyCta: "Verifie par kanal ofisiel",
      reportCta: "Rapport sa",
      checkAnother: "Verifie enn lot pelman",
      back: "Verifie enn mesaz plito",
    }),
  },
};

export function getCopy(lang: UiLanguage): Copy {
  return COPY[lang];
}

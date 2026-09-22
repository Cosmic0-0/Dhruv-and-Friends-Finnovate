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
import type { TrendCategory } from "./learn-content";
import type { SafeCheckKey, SignalKind, StepKey } from "./result";
import type { LanguageHint, Severity } from "./types";

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
  messageLabel: string;
  placeholder: string;
  submit: string;
  checking: string;
  stillWorking: string;
  uploadScreenshot: string;
  /** Short micro-label under the upload button's icon. */
  screenshotLabel: string;
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
    unexpectedTitle: string;
    unexpected: string;
  };
  relativeTime: (ms: number) => string;
  tabs: { check: string; learn: string; trends: string };
  trends: {
    title: string;
    intro: string;
    categories: { title: string; body: string; example: string }[];
    footerNote: string;
  };
  result: {
    title: string;
    fromSender: (sender: string) => string;
    back: string;
    warningSigns: (n: number) => string;
    risk: (score: number) => string;
    scamAdvice: string;
    messageYouSent: string;
    whyTitle: string;
    signalTitles: Record<SignalKind, string>;
    genericSignal: string;
    severity: Record<Severity, string>;
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
    checkAnother: string;
    missingTitle: string;
    missingBody: string;
  };
  learn: {
    headline: string;
    streak: (days: number) => string;
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
  };
}

/**
 * A Kreol string not written yet because we weren't confident in it. It
 * shows the English so the screen stays readable, and marks the spot for
 * the Kreol reviewer: grep TODO_KREOL.
 */
const TODO_KREOL = <T,>(english: T): T => english;

const LEARN_EN: Copy["learn"] = {
  headline: "Learn to spot them",
  streak: (d) => `${d}-day streak`,
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

const RESULT_EN: Copy["result"] = {
  title: "Result",
  fromSender: (s) => `SMS from ${s}`,
  back: "Back",
  warningSigns: (n) => (n === 0 ? "No warning signs" : n === 1 ? "1 warning sign" : `${n} warning signs`),
  risk: (s) => `Risk ${s} / 100`,
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
  checkAnother: "Check another message",
  missingTitle: "No check to show",
  missingBody: "Paste a message on the Check screen to see a result here.",
};

export const COPY: Record<UiLanguage, Copy> = {
  en: {
    languageSwitcher: "Language",
    headline: "Got a message about money?",
    subline: "Paste it here before you pay, click or share a code. We will show you what looks wrong and why.",
    messageLabel: "The message",
    placeholder: "Paste the SMS, WhatsApp or email text here...",
    submit: "Check this message",
    checking: "Checking…",
    stillWorking: "The AI is still working…",
    uploadScreenshot: "Upload a screenshot",
    screenshotLabel: "Screenshot",
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
        image_missing: "Choose a screenshot to upload.",
        image_invalid: "That file isn't a PNG, JPEG, or WEBP image.",
        image_too_large: "That image is too large. Please keep it under 5MB.",
        image_unreadable: "That image couldn't be read. Try a different file.",
        image_no_text: "We couldn't find any readable text in that screenshot.",
        invalid: "Something about that message didn't look right. Please check it and try again.",
      },
      llmTitle: "Our checker is busy",
      llm: "The analysis service didn't give an answer this time. Your message is still here, so try again in a moment.",
      networkTitle: "Can't reach FraudLens",
      network: "The checking service can't be reached right now. Check your connection and try again.",
      timeoutTitle: "That took too long",
      timeout: "The check took longer than expected and was stopped. Try again, it's often faster the second time.",
      unexpectedTitle: "Something went wrong",
      unexpected: "We got an answer we couldn't read. Please try again.",
    },
    relativeTime: (ms) =>
      relative(ms, { now: "just now", min: "min", hour: "h", day: "d", ago: (s) => `${s} ago` }),
    tabs: { check: "Check", learn: "Learn", trends: "Trends" },
    trends: {
      title: "Known scam patterns in Mauritius",
      intro:
        "FraudLens doesn't have a live report feed yet, so this isn't a ranked trend chart — it's the scam formats reported often enough in Mauritius to be worth knowing by sight.",
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
        'The closest thing to real trend data today: when you check a message, the result screen shows "reported by others" if that sender has been flagged before.',
    },
    result: RESULT_EN,
    learn: LEARN_EN,
  },

  fr: {
    languageSwitcher: "Langue",
    headline: "Un message qui parle d'argent ?",
    subline:
      "Collez-le ici avant de payer, de cliquer ou de partager un code. Nous vous montrerons ce qui cloche et pourquoi.",
    messageLabel: "Le message",
    placeholder: "Collez ici le texte du SMS, WhatsApp ou e-mail...",
    submit: "Vérifier ce message",
    checking: "Vérification…",
    stillWorking: "L'IA travaille encore…",
    uploadScreenshot: "Importer une capture d'écran",
    screenshotLabel: "Capture d'écran",
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
        invalid: "Ce message pose un problème. Vérifiez-le et réessayez.",
      },
      llmTitle: "Notre service est occupé",
      llm: "Le service d'analyse n'a pas répondu cette fois. Votre message est toujours là, réessayez dans un instant.",
      networkTitle: "FraudLens est injoignable",
      network: "Le service de vérification est injoignable pour le moment. Vérifiez votre connexion et réessayez.",
      timeoutTitle: "C'était trop long",
      timeout: "La vérification a pris trop de temps et a été arrêtée. Réessayez, c'est souvent plus rapide la deuxième fois.",
      unexpectedTitle: "Un problème est survenu",
      unexpected: "Nous avons reçu une réponse illisible. Veuillez réessayer.",
    },
    relativeTime: (ms) =>
      relative(ms, { now: "à l'instant", min: "min", hour: "h", day: "j", ago: (s) => `il y a ${s}` }),
    tabs: { check: "Vérifier", learn: "Apprendre", trends: "Tendances" },
    trends: {
      title: "Arnaques connues à Maurice",
      intro:
        "FraudLens n'a pas encore de flux de signalements en direct, ce n'est donc pas un classement en temps réel — ce sont les formats d'arnaque assez souvent signalés à Maurice pour être reconnus du premier coup d'œil.",
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
        "Ce qui se rapproche le plus d'une donnée de tendance aujourd'hui : quand vous vérifiez un message, l'écran de résultat indique si cet expéditeur a déjà été signalé par d'autres.",
    },
    result: {
      title: "Résultat",
      fromSender: (s) => `SMS de ${s}`,
      back: "Retour",
      warningSigns: (n) =>
        n === 0 ? "Aucun signal d'alerte" : n === 1 ? "1 signal d'alerte" : `${n} signaux d'alerte`,
      risk: (s) => `Risque ${s} / 100`,
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
      checkAnother: "Vérifier un autre message",
      missingTitle: "Aucun résultat",
      missingBody: "Collez un message dans l'onglet Vérifier pour voir un résultat ici.",
    },
    learn: {
      headline: "Apprenez à les repérer",
      streak: (d) => `${d} jours d'affilée`,
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
    },
  },

  kreol: {
    languageSwitcher: "Langaz",
    headline: "Ou finn gagn enn mesaz lor larzan?",
    subline:
      "Kol li isi avan ou pey, klik ouswa partaz enn kod. Nou pou montre ou seki paret pa bon ek kifer.",
    messageLabel: "Mesaz la",
    placeholder: "Kol text SMS, WhatsApp ouswa email la isi...",
    submit: "Verifie sa mesaz la",
    checking: "Pe verifie…",
    stillWorking: "LIA pe ankor travay…",
    uploadScreenshot: "Met enn screenshot",
    screenshotLabel: "Screenshot",
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
        invalid: "Ena enn problem ar sa mesaz la. Get li ek esey ankor.",
      },
      llmTitle: "Nou servis okipe",
      llm: "Servis analiz la pa finn reponn sa fwa la. Ou mesaz la ankor la, esey ankor dan enn ti moman.",
      networkTitle: "Pa kapav konekte ar FraudLens",
      network: "Pa kapav kontak servis verifikasion la aster. Get ou koneksion ek esey ankor.",
      timeoutTitle: "Sa inn pran tro boukou letan",
      timeout: "Verifikasion la inn pran tro boukou letan, nou finn aret li. Esey ankor, souvan li pli vit dezyem fwa.",
      unexpectedTitle: "Ena enn problem",
      unexpected: "Nou finn gagn enn repons ki nou pa kapav lir. Esey ankor.",
    },
    relativeTime: (ms) =>
      relative(ms, { now: "aster la", min: "min", hour: "er", day: "zour", ago: (s) => `ena ${s}` }),
    tabs: { check: "Verifie", learn: "Aprann", trends: "Tandans" },
    trends: {
      title: "Bann eskrokri konplet dan Moris",
      intro:
        "FraudLens pankor ena enn fli rapor an direk, alor sa se pa enn klasman an tanrsyel — se bann format eskrokri ki rapote ase souvan dan Moris pou ou rekonet zot dan enn kou lizie.",
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
    },
    // Result screen: every string here is unreviewed. TODO_KREOL marks the
    // ones we weren't confident enough to write (they show English for now).
    result: {
      title: "Rezilta",
      fromSender: (s) => `SMS depi ${s}`,
      back: "Retour",
      warningSigns: (n) => (n === 0 ? "Pena okenn siny danze" : `${n} siny danze`),
      risk: (s) => `Risk ${s} / 100`,
      scamAdvice: "Pa pey, pa ouver lien la, ek zame partaz enn kod ki ou gagn lor ou telefonn.",
      messageYouSent: "Mesaz ki ou finn avoye",
      whyTitle: "Kifer sa paret pa bon",
      signalTitles: {
        sender_mismatch: TODO_KREOL(RESULT_EN.signalTitles.sender_mismatch),
        lookalike_url: "Lien la pa pou labank",
        urgency_language: TODO_KREOL(RESULT_EN.signalTitles.urgency_language),
        spoofed_identity: TODO_KREOL(RESULT_EN.signalTitles.spoofed_identity),
        credential_request: "Li pe dimann enn kod ouswa ou detay personel",
        payment_request: "Li pe dimann ou pey ouswa avoy larzan",
        prize_offer: "Li pe promet enn zafer ki tro bon pou vre",
        secrecy: "Li pe dir ou gard sa sekre",
      },
      genericSignal: "Ena kiksoz ki pa bon",
      severity: TODO_KREOL(RESULT_EN.severity),
      lookalikeDomain: TODO_KREOL(RESULT_EN.lookalikeDomain),
      lookalikeBrand: TODO_KREOL(RESULT_EN.lookalikeBrand),
      linkCheck: {
        title: "Verifikasion lien",
        linkInMessage: "Lien dan mesaz la",
        imitates: TODO_KREOL(RESULT_EN.linkCheck.imitates),
        domainAge: TODO_KREOL(RESULT_EN.linkCheck.domainAge),
        domainAgeValue: TODO_KREOL(RESULT_EN.linkCheck.domainAgeValue),
        reportedByOthers: TODO_KREOL(RESULT_EN.linkCheck.reportedByOthers),
        // Kept with its label so the row isn't half English, half Kreol.
        reportedValue: TODO_KREOL(RESULT_EN.linkCheck.reportedValue),
      },
      whatToDoTitle: "Ki pou fer aster",
      steps: {
        dont_open_or_reply: "Pa ouver lien la ek pa reponn.",
        block_sender: TODO_KREOL(RESULT_EN.steps.block_sender),
        report_to_bank: TODO_KREOL(RESULT_EN.steps.report_to_bank),
        verify_official: TODO_KREOL(RESULT_EN.steps.verify_official),
        dont_share_code: TODO_KREOL(RESULT_EN.steps.dont_share_code),
        call_bank_card: TODO_KREOL(RESULT_EN.steps.call_bank_card),
        delete_and_report: "Efas mesaz la ek rapor li.",
      },
      whatWeCheckedTitle: "Seki nou finn verifie",
      checks: {
        no_link: "Pena lien, nanye pou klike",
        no_lookalike: TODO_KREOL(RESULT_EN.checks.no_lookalike),
        informs_not_asks: TODO_KREOL(RESULT_EN.checks.informs_not_asks),
        last_four_only: TODO_KREOL(RESULT_EN.checks.last_four_only),
        no_pressure: TODO_KREOL(RESULT_EN.checks.no_pressure),
      },
      safeCaveat: TODO_KREOL(RESULT_EN.safeCaveat),
      report: {
        reportSender: "Rapor sa kinn avoy li",
        reportMessage: "Rapor sa mesaz la",
        senderLabel: "Kisannla kinn avoy li?",
        senderPlaceholder: "Nimero ouswa nom",
        submit: "Avoy rapor la",
        sending: "Pe avoye…",
        done: TODO_KREOL(RESULT_EN.report.done),
        failed: TODO_KREOL(RESULT_EN.report.failed),
        note: TODO_KREOL(RESULT_EN.report.note),
      },
      sentTitle: "Seki finn avoye pou analiz",
      sentBody: TODO_KREOL(RESULT_EN.sentBody),
      checkAnother: "Verifie enn lot mesaz",
      missingTitle: "Pena rezilta",
      missingBody: "Kol enn mesaz dan Verifie pou trouv enn rezilta isi.",
    },
    // Learn tab: every string here is unreviewed. TODO_KREOL marks the ones we
    // weren't confident enough to write at all (they show English for now).
    learn: {
      headline: "Aprann rekonet zot",
      streak: TODO_KREOL(LEARN_EN.streak),
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
      scoreComment: TODO_KREOL(LEARN_EN.scoreComment),
      best: (b, t) => `Ou pli bon skor: ${b} / ${t}`,
      playAgain: "Zwe ankor",
      syntheticNote: TODO_KREOL(LEARN_EN.syntheticNote),
      trendsTitle: TODO_KREOL(LEARN_EN.trendsTitle),
      trends: TODO_KREOL(LEARN_EN.trends),
    },
  },
};

export function getCopy(lang: UiLanguage): Copy {
  return COPY[lang];
}

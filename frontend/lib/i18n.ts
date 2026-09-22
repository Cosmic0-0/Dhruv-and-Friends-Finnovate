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
  comingSoon: string;
  soon: string;
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
  placeholderPage: { learnTitle: string; trendsTitle: string; body: string };
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
}

function relative(ms: number, words: { now: string; min: string; hour: string; day: string; ago: (s: string) => string }) {
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1) return words.now;
  if (minutes < 60) return words.ago(`${minutes} ${words.min}`);
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return words.ago(`${hours} ${words.hour}`);
  return words.ago(`${Math.floor(hours / 24)} ${words.day}`);
}

const fmt = (n: number, locale: string) => n.toLocaleString(locale);

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
    comingSoon: "Screenshot upload is coming soon",
    soon: "Soon",
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
    placeholderPage: {
      learnTitle: "Learn the warning signs",
      trendsTitle: "Scam trends in Mauritius",
      body: "This section is on its way.",
    },
    result: {
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
        prize_offer: "It offers a prize that's too good to be true",
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
    },
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
    comingSoon: "L'import de capture d'écran arrive bientôt",
    soon: "Bientôt",
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
    placeholderPage: {
      learnTitle: "Reconnaître les signaux d'alerte",
      trendsTitle: "Tendances des arnaques à Maurice",
      body: "Cette section arrive bientôt.",
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
        prize_offer: "Il promet un gain trop beau pour être vrai",
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
    comingSoon: "Screenshot pe vini byento",
    soon: "Byento",
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
    placeholderPage: {
      learnTitle: "Aprann rekonet bann siny",
      trendsTitle: "Tandans eskrokri Moris",
      body: "Sa seksion la pe vini byento.",
    },
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
        sender_mismatch: "Sa kinn avoy li pa seki li dir li ete",
        lookalike_url: "Lien la pa pou labank",
        urgency_language: "Li pe fors ou pou depese",
        spoofed_identity: "Li pe fer krwar li enn dimoun ou fer konfians",
        credential_request: "Li pe dimann enn kod ouswa ou detay personel",
        payment_request: "Li pe dimann ou pey ouswa avoy larzan",
        prize_offer: "Li pe promet enn pri ki tro bon pou vre",
        secrecy: "Li pe dir ou gard sa sekre",
      },
      genericSignal: "Ena kiksoz ki pa bon",
      severity: { low: "Ba", medium: "Mwayen", high: "O" },
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
      checkAnother: "Verifie enn lot mesaz",
      missingTitle: "Pena rezilta",
      missingBody: "Kol enn mesaz dan Verifie pou trouv enn rezilta isi.",
    },
  },
};

export function getCopy(lang: UiLanguage): Copy {
  return COPY[lang];
}

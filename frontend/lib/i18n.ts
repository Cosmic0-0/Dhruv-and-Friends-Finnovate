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
import type { LanguageHint } from "./types";

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
    yourMessage: string;
    whyTitle: string;
    signalsTitle: string;
    noSignals: string;
    nextStepTitle: string;
    sentTitle: string;
    sentBody: string;
    checkAnother: string;
    missingTitle: string;
    missingBody: string;
    severity: Record<"low" | "medium" | "high", string>;
    actions: Record<string, string>;
    riskScore: string;
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
      yourMessage: "Your message",
      whyTitle: "Why we think so",
      signalsTitle: "What looks wrong",
      noSignals: "No specific warning signs were flagged.",
      nextStepTitle: "What to do next",
      sentTitle: "What was sent for analysis",
      sentBody: "Only this version left your phone. Phone numbers, emails and account numbers were replaced first.",
      checkAnother: "Check another message",
      missingTitle: "No check to show",
      missingBody: "Paste a message on the Check screen to see a result here.",
      severity: { low: "Low", medium: "Medium", high: "High" },
      actions: {
        block_sender: "Block the sender and don't reply.",
        report_to_bank: "Report it to your bank's fraud line, using the number on your card.",
        verify_official_channel: "Contact the company through its official app, website or number, not the one in the message.",
      },
      riskScore: "Risk score",
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
      yourMessage: "Votre message",
      whyTitle: "Pourquoi",
      signalsTitle: "Ce qui cloche",
      noSignals: "Aucun signal d'alerte précis n'a été relevé.",
      nextStepTitle: "Que faire ensuite",
      sentTitle: "Ce qui a été envoyé pour analyse",
      sentBody:
        "Seule cette version a quitté votre téléphone. Les numéros de téléphone, e-mails et numéros de compte ont d'abord été remplacés.",
      checkAnother: "Vérifier un autre message",
      missingTitle: "Aucun résultat",
      missingBody: "Collez un message dans l'onglet Vérifier pour voir un résultat ici.",
      severity: { low: "Faible", medium: "Moyen", high: "Élevé" },
      actions: {
        block_sender: "Bloquez l'expéditeur et ne répondez pas.",
        report_to_bank: "Signalez-le au service fraude de votre banque, au numéro indiqué sur votre carte.",
        verify_official_channel:
          "Contactez l'entreprise via son application, son site ou son numéro officiel, pas celui du message.",
      },
      riskScore: "Score de risque",
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
      yourMessage: "Ou mesaz",
      whyTitle: "Kifer",
      signalsTitle: "Seki paret pa bon",
      noSignals: "Pena okenn siny danze presi.",
      nextStepTitle: "Ki pou fer aster",
      sentTitle: "Seki finn avoye pou analiz",
      sentBody: "Zis sa version la ki finn kit ou telefonn. Nimero telefonn, email ek nimero kont finn ranplase avan.",
      checkAnother: "Verifie enn lot mesaz",
      missingTitle: "Pena rezilta",
      missingBody: "Kol enn mesaz dan Verifie pou trouv enn rezilta isi.",
      severity: { low: "Ba", medium: "Mwayen", high: "O" },
      actions: {
        block_sender: "Blok sa kinn avoy li ek pa reponn.",
        report_to_bank: "Rapport li ar servis fraud ou labank, lor nimero ki lor ou kart.",
        verify_official_channel: "Kontak lakonpani par so app, so sit ouswa so nimero ofisiel, pa sa ki dan mesaz la.",
      },
      riskScore: "Skor risk",
    },
  },
};

export function getCopy(lang: UiLanguage): Copy {
  return COPY[lang];
}

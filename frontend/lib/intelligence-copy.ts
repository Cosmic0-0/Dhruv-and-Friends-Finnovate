import type { UiLanguage } from "./i18n";
// Pending native-language review, matching the application’s TODO_KREOL convention.
const TODO_KREOL = (value: string) => value;
const french: Record<string, string> = {
  "← Message check": "← Vérifier un message",
  "Campaign intelligence / ScamDNA": "Analyse de campagne / ScamDNA",
  "Follow the connections.": "Suivez les connexions.",
  "Explore the senders, claimed identity and links observed in this scam pattern.": "Explorez les expéditeurs, l’identité revendiquée et les liens observés dans ce schéma de fraude.",
  "Checks": "Analyses",
  "Senders": "Expéditeurs",
  "Domains": "Domaines",
  "Mapping observed connections…": "Cartographie des connexions observées…",
  "Try again": "Réessayer",
  "Entity inspector": "Détails de l’entité",
  "Observation": "Observation",
  "Connection": "Connexion",
  "Shared scam type and claimed identity": "Type de fraude et identité revendiquée en commun",
  "Connections show a shared observed pattern. They do not prove a common operator or wrongdoing by the impersonated institution.": "Ces connexions révèlent un schéma observé en commun. Elles ne prouvent ni un opérateur commun ni une faute de l’institution usurpée.",
  "View accessible entity list ·": "Liste accessible des entités ·",
  "entities": "entités",
  "Practice lab / Educational simulation": "Atelier pratique / Simulation pédagogique",
  "Recognise the next move.": "Reconnaissez la prochaine étape.",
  "Step inside a scam scenario. See how pressure builds, learn the tactic behind each message, and practise knowing when to stop.": "Explorez un scénario de fraude. Observez la montée de la pression, découvrez la tactique de chaque message et apprenez quand vous arrêter.",
  "Choose a scenario": "Choisissez un scénario",
  "Loading scenarios…": "Chargement des scénarios…",
  "Fictional messages. No messages are sent to anyone. No personal details are needed.": "Messages fictifs. Aucun message n’est envoyé à qui que ce soit. Aucune donnée personnelle n’est nécessaire.",
  "Your objective": "Votre objectif",
  "Notice the shift from a believable introduction to a request for money, credentials or control.": "Repérez le passage d’une introduction crédible à une demande d’argent, d’identifiants ou de contrôle.",
  "Simulation progress": "Progression de la simulation",
  "Reset and choose another scenario": "Recommencer avec un autre scénario",
  "Scam sandbox": "Simulateur de fraude",
  "Simulation only": "Simulation uniquement",
  "A safe place to spot the pattern.": "Un espace sûr pour repérer le schéma.",
  "Advance one message at a time. Each fictional message comes with an explanation of the technique being used.": "Avancez message par message. Chaque message fictif est accompagné d’une explication de la technique utilisée.",
  "Scammer": "Escroc",
  "Simulated message": "Message simulé",
  "Tactic /": "Tactique /",
  "Simulation ended": "Simulation terminée",
  "You’ve seen the pattern.": "Vous avez reconnu le schéma.",
  "Try another scenario": "Essayer un autre scénario",
  "Check a real message →": "Vérifier un vrai message →",
  "Reload scenarios": "Recharger les scénarios",
  "Preparing the next scenario message…": "Préparation du prochain message…",
  "Finish simulation →": "Terminer la simulation →",
  "Continue simulation →": "Continuer la simulation →",
  "Start simulation →": "Démarrer la simulation →",
  "Cancel this step": "Annuler cette étape",
  "Campaign": "Campagne",
  "Claimed identity": "Identité revendiquée",
  "Sender": "Expéditeur",
  "Domain": "Domaine",
  "Observed in a flagged link": "Observé dans un lien signalé",
  "Impersonated name · not an accusation": "Nom usurpé · sans accusation",
  "Report count unavailable": "Nombre de signalements indisponible",
  "Scenario messages and tactic explanations are shown in the source language.": "Les messages du scénario et les explications des tactiques sont présentés dans leur langue d’origine.",
  "In a real conversation, stop before sharing a code or sending money. Verify through the institution’s official app or a number you already trust.": "Dans une vraie conversation, arrêtez-vous avant de partager un code ou d’envoyer de l’argent. Vérifiez via l’application officielle ou un numéro de confiance.",
  "Tactics encountered": "Tactiques rencontrées"
};

// Some strings are built with an interpolated count before being passed to
// t() (FraudNetworkGraph.tsx's node `detail` fields, e.g. "3 observed
// checks") — a plain dictionary lookup can never match those, since the
// exact number varies per campaign. Matched against the ENGLISH string
// (already interpolated) so call sites don't need to change; only French
// needs plural-aware digit-stripped rules, Kreol still falls through to
// TODO_KREOL(english) like everything else here.
const TEMPLATES: ReadonlyArray<[RegExp, (n: string) => string]> = [
  [/^(\d+) observed checks$/, (n) => `${n} vérification${n === "1" ? "" : "s"} observée${n === "1" ? "" : "s"}`],
  [/^(\d+) community reports$/, (n) => `${n} signalement${n === "1" ? "" : "s"} communautaire${n === "1" ? "" : "s"}`],
];

function translateFrench(english: string): string {
  if (english in french) return french[english];
  for (const [re, build] of TEMPLATES) {
    const m = english.match(re);
    if (m) return build(m[1]);
  }
  return english;
}

export function intelligenceCopy(lang: UiLanguage) {
  return (english: string) => (lang === "fr" ? translateFrench(english) : lang === "kreol" ? TODO_KREOL(english) : english);
}

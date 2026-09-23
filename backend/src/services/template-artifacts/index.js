// Non-LLM, deterministic — must stay unit-testable independent of the LLM call path
// (mirrors services/domain-matching, services/identity-consistency).
//
// Real one-to-one correspondence never contains unrendered mail-merge
// syntax like "{{.FirstName}}" or "{%tracker%}" — that's an artifact of a
// templating engine (Go templates/GoPhish, Jinja2, Mustache, Mailchimp
// merge tags) that failed to substitute a value. Seeing it in a "message"
// is near-conclusive evidence the content is a mass-produced phishing
// template or simulation, not genuine correspondence — a fact an LLM can
// miss entirely when the rest of the message reads as calm, non-urgent
// prose (see the HR/parking-space phishing example this was built from:
// the LLM scored it "safe" despite two unrendered {{.FirstName}}/
// {{.Tracker}} tags sitting in the message text).
//
// Deliberately conservative: only matches placeholder-shaped interiors
// (identifier/dotted-path characters, optionally with a leading template
// sigil like "." or "#"), not arbitrary bracketed prose, to keep the
// false-positive rate near zero on genuine messages.
const PLACEHOLDER_PATTERNS = [
  /\{\{\s*[.#/]?[\w.]+\s*\}\}/g, // {{.FirstName}}, {{ user.email }}, {{#if x}} — Go templates/GoPhish/Mustache
  /\{%\s*[.#/]?[\w. ]+\s*%\}/g, // {% tracker %} — Jinja2/Django
  /%%[\w.]+%%/g, // %%FIRST_NAME%% — Mailchimp-style merge tags
];

export function findTemplatePlaceholders(message) {
  const matches = new Set();
  for (const pattern of PLACEHOLDER_PATTERNS) {
    for (const match of message.matchAll(pattern)) {
      matches.add(match[0]);
    }
  }
  return [...matches];
}

export function checkTemplateArtifacts(message) {
  const placeholders = findTemplatePlaceholders(message);
  if (placeholders.length === 0) return [];

  const example = placeholders[0];
  return [
    {
      type: "TEMPLATE_ARTIFACT",
      description: `The message contains unrendered mail-merge/template placeholder syntax (e.g. "${example}") — real personal or institutional correspondence never does. This is a strong indicator the content is a mass-produced phishing template or simulation, not a genuine one-to-one message, independent of how calm or plausible the rest of the wording is.`,
      severity: "high",
      source: "template_check",
      placeholders,
      evidence: example,
    },
  ];
}

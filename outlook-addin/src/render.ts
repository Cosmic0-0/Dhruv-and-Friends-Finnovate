import type { AnalyzeResponse, ExtractionReport, FraudSignal, SignalComparison } from "./types";

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

function humanize(value: string): string {
  return value.replace(/[_-]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function displayValue(value: unknown): string {
  if (Array.isArray(value)) return value.map(displayValue).join(", ");
  if (value === null || value === undefined || value === "") return "Not available";
  if (typeof value === "object") return Object.values(value as Record<string, unknown>).map(displayValue).join(" · ");
  return String(value);
}

function comparisonRows(comparison: SignalComparison): Array<{ label: string; value: string }> {
  const rows: Array<{ label: string; value: string }> = [];
  const expected = comparison.expected ?? comparison.protectedDomain ?? comparison.knownSupplierDomain ?? comparison.knownAccountLast4;
  const observed = comparison.observed ?? comparison.observedDomain ?? comparison.requestedAccountLast4;
  if (expected !== undefined) rows.push({ label: "Expected / known", value: displayValue(expected) });
  if (observed !== undefined) rows.push({ label: "Received / requested", value: displayValue(observed) });
  if (comparison.technique) rows.push({ label: "Difference", value: humanize(comparison.technique) });
  return rows;
}

function signalItem(signal: FraudSignal): HTMLElement {
  const article = el("article", "finding");
  const top = el("div", "finding__top");
  const severityClass = signal.severity.toLowerCase().replace(/[^a-z]/g, "");
  top.append(el("span", "finding__code", signal.code), el("span", `finding__severity finding__severity--${severityClass}`, humanize(signal.severity)));
  article.append(top, el("h3", "finding__title", signal.description));
  if (signal.evidence) article.append(el("p", "finding__evidence", `“${signal.evidence}”`));

  const comparison = signal.metadata?.comparison;
  if (comparison) {
    const rows = comparisonRows(comparison);
    if (rows.length) {
      const grid = el("dl", "comparison");
      for (const row of rows) {
        const cell = el("div", "comparison__cell");
        cell.append(el("dt", "micro", row.label), el("dd", "comparison__value", row.value));
        grid.append(cell);
      }
      article.append(grid);
    }
  }
  if (signal.scored === false) article.append(el("p", "finding__corroboration", "Corroborating evidence — not scored twice"));
  else if (signal.corroboratedBy?.length) article.append(el("p", "finding__corroboration", `Corroborated by ${signal.corroboratedBy.join(", ")}`));
  return article;
}

function section(title: string, items: FraudSignal[], kind: "verified" | "inferred"): HTMLElement | null {
  if (!items.length) return null;
  const block = el("section", `evidence evidence--${kind}`);
  const header = el("div", "section-heading");
  header.append(el("span", `provenance provenance--${kind}`, kind === "verified" ? "Verified / deterministic" : "AI-inferred"));
  header.append(el("span", "section-heading__count", String(items.length)));
  block.append(header);
  for (const item of items) block.append(signalItem(item));
  return block;
}

function campaignNotice(result: AnalyzeResponse): HTMLElement | null {
  const signal = result.signals.find((item) => item.code === "ORG-06");
  const campaigns = result.analysis.organisation?.campaigns ?? [];
  if (!signal && campaigns.length === 0) return null;
  const notice = el("section", "campaign-notice");
  notice.append(el("p", "micro", "Related activity detected"));
  notice.append(el("h2", "campaign-notice__title", "Similar suspicious email activity has been observed."));
  const meta = signal?.metadata ?? campaigns[0] ?? {};
  const facts = [
    typeof meta.messages === "number" ? `${meta.messages} related emails` : null,
    typeof meta.recipients === "number" ? `${meta.recipients} recipients` : null,
  ].filter(Boolean);
  if (facts.length) notice.append(el("p", "campaign-notice__meta", facts.join(" · ")));
  return notice;
}

function actions(result: AnalyzeResponse): HTMLElement {
  const block = el("section", "actions-block");
  block.append(el("p", "micro", result.risk.level === "low" ? "Continue carefully" : "Recommended action"));
  const list = el("ol", "actions-list");
  for (const action of result.actions) list.append(el("li", "actions-list__item", action.text || action.label || action.description || humanize(action.id)));
  block.append(list);
  return block;
}

function verification(result: AnalyzeResponse): HTMLElement | null {
  if (!result.verification?.workflows?.length) return null;
  const block = el("section", "verification");
  block.append(el("p", "micro", "Verification workflow"));
  for (const workflow of result.verification.workflows) {
    const wrapper = el("div", "workflow");
    wrapper.append(el("h2", "workflow__title", workflow.title));
    if (workflow.owner) wrapper.append(el("p", "workflow__owner", `Owner · ${workflow.owner}`));
    const steps = el("ol", "workflow__steps");
    for (const step of workflow.steps) steps.append(el("li", "workflow__step", step));
    wrapper.append(steps);
    if (workflow.requiredApprovals > 0) wrapper.append(el("p", "workflow__approvals", `${workflow.requiredApprovals} approval${workflow.requiredApprovals === 1 ? "" : "s"} required`));
    block.append(wrapper);
  }
  return block;
}

function trace(result: AnalyzeResponse): HTMLElement {
  const details = el("details", "trace");
  const summary = el("summary", "trace__summary", "Why this decision?");
  details.append(summary);
  const rows = el("div", "trace__rows");
  const policy = el("div", "trace__row");
  policy.append(el("code", "trace__id", "DECISION"), el("span", "trace__points", humanize(result.decision)), el("p", "trace__reason", "Deterministic decision policy output"));
  rows.append(policy);
  for (const item of result.trace) {
    const row = el("div", "trace__row");
    row.append(el("code", "trace__id", item.id));
    const delta = item.points !== undefined ? `${item.points >= 0 ? "+" : ""}${item.points}` : item.levelFloor ? `→ ${item.levelFloor.toUpperCase()}` : "";
    row.append(el("span", "trace__points", delta), el("p", "trace__reason", item.reason));
    rows.append(row);
  }
  const supplied = result.analysis.email?.availableEvidence ?? [];
  if (supplied.length) rows.append(el("p", "trace__ruleset", `Outlook evidence supplied: ${supplied.map(humanize).join(", ")}`));
  if (result.analysis.organisation?.senderRelation) {
    rows.append(el("p", "trace__ruleset", `Organisation sender relation: ${humanize(result.analysis.organisation.senderRelation)}`));
  }
  rows.append(el("p", "trace__ruleset", `Ruleset ${result.analysis.rulesetVersion}`));
  details.append(rows);
  return details;
}

function lowRiskEvidence(result: AnalyzeResponse): HTMLElement | null {
  if (result.risk.level !== "low") return null;
  const checks = result.analysis.email?.checks ?? {};
  const statements: string[] = [];
  if (checks.supplier === "sender_matches_supplier_record") statements.push("Sender matches the known supplier record.");
  if (checks.thread === "compared") statements.push("Available conversation sender evidence was checked.");
  if (checks.authentication === "evaluated" && !result.signals.some((signal) => signal.code === "EMAIL-03")) statements.push("No authentication anomaly was reported.");
  const block = el("section", "low-evidence");
  block.append(el("p", "micro", "Observed checks"));
  block.append(el("p", "low-evidence__copy", "No strong fraud indicators were found. This is not a guarantee of authenticity."));
  if (statements.length) {
    const list = el("ul", "low-evidence__list");
    for (const statement of statements) list.append(el("li", undefined, statement));
    block.append(list);
  }
  return block;
}

function analysedEmail(extraction: ExtractionReport, analysedAt: Date): HTMLElement {
  const block = el("section", "analysed");
  block.append(el("p", "micro", "Analysed email"));
  block.append(el("p", "analysed__subject", extraction.subject || "(no subject)"));
  const time = analysedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  block.append(el("p", "analysed__meta", `${extraction.fromAddress ?? "Sender address unavailable"} · checked ${time}`));
  return block;
}

export function renderResult(root: HTMLElement, result: AnalyzeResponse, extraction?: ExtractionReport, analysedAt: Date = new Date(), onReanalyze?: () => void): void {
  root.replaceChildren();
  const shell = el("div", `result result--${result.risk.level}`);
  const masthead = el("header", "masthead masthead--compact");
  masthead.append(el("span", "brand-mark", "FL"), el("span", "brand-name", "FraudLens"));

  const verdict = el("section", "verdict");
  verdict.append(el("p", "micro verdict__eyebrow", "Current email assessment"));
  verdict.append(el("h1", "verdict__level", `${result.risk.level.toUpperCase()} RISK`));
  verdict.append(el("p", "verdict__message", result.risk.level === "low" ? "Continue with your normal business process." : "Verify before taking action."));
  const measure = el("div", "verdict__measure");
  measure.append(el("span", "verdict__score", `${result.risk.score}`), el("span", "verdict__denominator", "/ 100"), el("span", "verdict__confidence", `${humanize(result.risk.confidence)} confidence`));
  verdict.append(measure);
  shell.append(masthead);
  if (extraction) shell.append(analysedEmail(extraction, analysedAt));
  shell.append(verdict, actions(result));

  const semanticUnavailable = result.analysis.semantic.status !== "ok";
  if (semanticUnavailable) {
    const note = el("section", "status-note");
    note.append(el("strong", undefined, "Deterministic checks completed."), document.createTextNode(" AI language analysis was unavailable; the rule-based result above is still valid."));
    shell.append(note);
  }

  const campaign = campaignNotice(result);
  if (campaign) shell.append(campaign);
  const verify = verification(result);
  if (verify) shell.append(verify);
  const low = lowRiskEvidence(result);
  if (low) shell.append(low);

  const verified = result.signals.filter((signal) => signal.sourceType !== "semantic_model");
  const inferred = result.signals.filter((signal) => signal.sourceType === "semantic_model");
  const verifiedSection = section("Verified", verified, "verified");
  const inferredSection = section("Inferred", inferred, "inferred");
  if (verifiedSection) shell.append(verifiedSection);
  if (inferredSection) shell.append(inferredSection);

  shell.append(trace(result));
  if (extraction && (extraction.bodyTruncated || extraction.quotedContextRemoved || extraction.urlsOmitted || extraction.urlsShortened || extraction.unavailable.length)) {
    const details = el("details", "extraction");
    details.append(el("summary", "extraction__summary", "Outlook evidence availability"));
    const list = el("ul", "extraction__list");
    if (extraction.bodyTruncated) list.append(el("li", undefined, "Long body trimmed after preserving the current message."));
    if (extraction.quotedContextRemoved) list.append(el("li", undefined, "Quoted historical thread removed from the submitted body."));
    if (extraction.urlsShortened) list.append(el("li", undefined, `${extraction.urlsShortened} very long link${extraction.urlsShortened === 1 ? "" : "s"} checked without the query string.`));
    if (extraction.urlsOmitted) list.append(el("li", undefined, `${extraction.urlsOmitted} very long link${extraction.urlsOmitted === 1 ? "" : "s"} not submitted for checking.`));
    for (const missing of extraction.unavailable) list.append(el("li", undefined, `${humanize(missing)} unavailable; no suspicion was inferred from it.`));
    details.append(list);
    shell.append(details);
  }
  if (onReanalyze) {
    const again = el("button", "secondary-button", "Analyse again");
    again.type = "button";
    again.addEventListener("click", onReanalyze);
    shell.append(again);
  }
  shell.append(el("footer", "result-footer", "Score calculated by FraudLens rules. AI did not calculate this score."));
  root.append(shell);
}

export function renderIdle(root: HTMLElement, onAnalyze: () => void): void {
  root.replaceChildren();
  const shell = el("div", "idle");
  const masthead = el("header", "masthead");
  const lockup = el("div", "brand-lockup");
  lockup.append(el("span", "brand-name", "FraudLens"), el("span", "brand-subtitle", "Email intelligence"));
  masthead.append(el("span", "brand-mark", "FL"), lockup);
  const intro = el("section", "idle__intro");
  intro.append(el("p", "micro", "Current message"));
  intro.append(el("h1", "idle__title", "Check the evidence before you act."));
  intro.append(el("p", "idle__copy", "FraudLens examines the email body and available Outlook metadata using the same fraud, BEC, and organisation rules as the main service."));
  const button = el("button", "analyze-button", "Analyse email");
  button.type = "button";
  button.addEventListener("click", onAnalyze);
  intro.append(button);
  const privacy = el("section", "privacy-note");
  privacy.append(el("span", "privacy-note__index", "01"));
  const privacyCopy = el("div");
  privacyCopy.append(el("p", "micro", "Privacy boundary"), el("p", "privacy-note__copy", "Attachment contents are never uploaded. Missing headers remain unknown. FraudLens does not contact anyone or change the email."));
  privacy.append(privacyCopy);
  shell.append(masthead, intro, privacy);
  root.append(shell);
}

export function renderLoading(root: HTMLElement): void {
  root.replaceChildren();
  const shell = el("div", "loading");
  shell.append(el("span", "brand-mark", "FL"), el("p", "micro", "Analysing current message"), el("h1", "loading__title", "Checking facts, language, and organisation context."));
  const line = el("div", "loading__line");
  line.append(el("span", "loading__fill"));
  shell.append(line, el("p", "loading__copy", "The deterministic result will still return if AI language analysis is unavailable."));
  root.append(shell);
}

export function renderError(root: HTMLElement, message: string, onRetry: () => void): void {
  root.replaceChildren();
  const shell = el("div", "error-state");
  shell.append(el("span", "brand-mark", "FL"), el("p", "micro", "Analysis unavailable"), el("h1", "error-state__title", "FraudLens could not check this email."), el("p", "error-state__copy", message));
  const button = el("button", "retry-button", "Try again");
  button.type = "button";
  button.addEventListener("click", onRetry);
  shell.append(button);
  root.append(shell);
}

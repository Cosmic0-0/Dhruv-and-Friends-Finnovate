import { test } from "node:test";
import assert from "node:assert/strict";
import { checkTemplateArtifacts, findTemplatePlaceholders } from "./index.js";

test("checkTemplateArtifacts flags Go-template/GoPhish-style placeholders", () => {
  const signals = checkTemplateArtifacts("Dear {{.FirstName}}, your parking space is ready. {{.Tracker}}");
  assert.equal(signals.length, 1);
  assert.equal(signals[0].type, "TEMPLATE_ARTIFACT");
  assert.equal(signals[0].severity, "high");
  assert.equal(signals[0].source, "template_check");
  assert.deepEqual(signals[0].placeholders, ["{{.FirstName}}", "{{.Tracker}}"]);
});

test("checkTemplateArtifacts flags Jinja2/Django-style placeholders", () => {
  const signals = checkTemplateArtifacts("Hello {% first_name %}, please confirm your details.");
  assert.equal(signals.length, 1);
  assert.equal(signals[0].type, "TEMPLATE_ARTIFACT");
});

test("checkTemplateArtifacts flags Mailchimp-style merge tags", () => {
  const signals = checkTemplateArtifacts("Hi %%FIRST_NAME%%, confirm your account now.");
  assert.equal(signals.length, 1);
  assert.equal(signals[0].type, "TEMPLATE_ARTIFACT");
});

test("checkTemplateArtifacts does not flag ordinary messages with no placeholders", () => {
  assert.deepEqual(checkTemplateArtifacts("Dear John, your parking space is ready."), []);
});

test("checkTemplateArtifacts does not flag ordinary curly braces used as prose", () => {
  // No placeholder-shaped interior (spaces/punctuation, not an identifier/dotted path).
  assert.deepEqual(checkTemplateArtifacts("Use the {curly brace} key on your keyboard."), []);
});

test("findTemplatePlaceholders deduplicates repeated placeholders", () => {
  const found = findTemplatePlaceholders("{{.Tracker}} ... later again {{.Tracker}}");
  assert.deepEqual(found, ["{{.Tracker}}"]);
});

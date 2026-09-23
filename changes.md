# FraudLens AI — P1 working changes

## Context and current priority

The requested scope is all five P1 features: Scam Journey, ScamDNA, Fraud Network,
Conversation Mode, and Scam Sandbox. Shared foundation: a finite stage/type taxonomy
and deterministic playbooks. React Flow is the agreed graph library. Sandbox uses
the existing LLM transport with playbook grounding and scripted fallback.

**Latest instruction: revamp the UI first; continue the rest later.** This pass is
now scoped to visual integration, responsive browser review, and interaction
polish. Further P1 functionality and full end-to-end validation are deferred.
Backend edits already made remain intact at a tested checkpoint (93 tests pass).
This file will be updated as work proceeds.

## Authorization and coordination

- Cross-directory backend/frontend work is authorized by the user.
- The user explicitly requested parallel agents. Work is split into backend,
  Journey/Conversation, and Network/Sandbox; the primary session owns landing,
  navigation, overall integration, QA, and this document.
- The user confirmed the peer session is finished and transferred ownership of
  `app/page.tsx`, `components/ResultView.tsx`, and `components/result/*`.
- Existing uncommitted changes were present at session start, including analysis
  foundation, API documentation, global styles, navigation, SafePay, and copy.
  These have been preserved and built upon. `EXPLAINER.md`, root package files,
  and root `node_modules` also pre-existed this work.
- No shared dev server or database is used for QA. Scratch project:
  `/tmp/fraudlens-p1-qa`; frontend port 3411, backend reserved port 4411;
  isolated headless Chrome profile and debugging port 9411.
- Sandbox permission controls remain active. Required localhost/browser commands
  use explicit environment approval; no permissions bypass was applied.

## UI changes implemented so far

- Landing: dark instrument surface, restrained grid/ring detail, stronger type
  hierarchy, existing translated positioning and SafePay call to action.
- Added a three-tool workspace section with working SafePay, Conversation, and
  Sandbox links, responsive columns, icons, hover and keyboard focus states.
- Added contextual Message / Conversation / Sandbox navigation so new features
  are discoverable without scrolling to the bottom of the landing page.
- Journey: reusable nine-stage vertical stepper, current-stage marker, likely-next
  explanations, and a caveat that earlier taxonomy stages are not observed facts.
  Absent journey data renders nothing. Result view links to a fraud network only
  for a stored matching campaign.
- Conversation: message-by-message analysis, verdict and stage labels, furthest
  stage retained across later lower/unresolved stages, shared Journey sidebar,
  redaction before sending, cancellation, length checks after redaction, localized
  errors, accessible announcements, and composer focus restoration.
- EN/FR Journey and Conversation copy; Kreol additions marked as review fallbacks.
- Fraud Network and Sandbox UI are in progress in parallel, with custom graph
  nodes, selection detail, simulation labels, and bounded progression.
- Sitemap includes the public Conversation and Sandbox entry pages.

## Important implementation findings

- Existing analysis `sender` means claimed institution in the current prompt.
  It must not be treated as the actual phone/sender when relating campaign nodes.
  Backend work adds separately validated observed-sender information; browser
  redaction placeholders must never become real graph identities.
- First campaign observation must have zero related counts. Related observations
  are stored evidence, not fabricated community reports or confirmed attribution.
- Campaign graph routes return 404 for unknown fingerprints.
- Sandbox stage progression must come from backend playbooks, avoiding divergent
  frontend copies; fallback selection is deterministic by turn index.
- Dark surfaces need explicit heading text color because base h1/h2/h3 styles set
  ink color. Fixed this in the Conversation sidebar.

## Verification so far

- Initial isolated desktop landing render: one h1, no horizontal overflow, no
  JavaScript exceptions. Screenshot reviewed; shortened visual hierarchy after
  review so the long supporting paragraph is not an oversized headline.
- Frontend existing tests plus four new progression tests pass: all eight test
  files under Node 22.
- Backend agent reports 93 passing tests at its final checkpoint; endpoint
  integration and API docs are present, but full live validation is deferred.
- Full TypeScript check is pending React Flow dependency and Sandbox completion.
- Full real-model, campaign graph, conversation, Sandbox cap/failure, mobile and
  final build checks are not yet complete. No claim of live verification yet.

## Remaining work

1. Finish and review the UI first: graph, sandbox, landing, result and conversation;
   inspect desktop/mobile states and fix concrete visual or interaction issues.
2. Complete backend/API documentation integration and run final test suites.
3. Exercise real-model flows and deterministic fallback using isolated servers and
   an isolated database; verify actual connected graph nodes, not only page load.
4. Update this document with final checks and any limitations. No commit, merge,
   deployment, or push has been performed by this session.

# SUGGESTIONS.md

Research pass over 12 external scam/fraud-detection projects (11 GitHub repos +
1 Medium hackathon writeup), done to sanity-check FraudLens AI's approach and
pull in anything worth stealing before the demo. Organized by the areas in
`CLAUDE.md` → Role gating, so each owner can skim their own section. Nothing
here is a directive — these are ideas to weigh against the 72-hour budget and
the judging priorities in `CLAUDE.md` (reliability > differentiation >
presentation, in that order). A one-paragraph note on each source is in the
Appendix at the bottom for traceability.

**Overall finding:** none of the 12 sources handle code-switched
Kreol/French/English text, none do local-domain lookalike-URL matching for a
specific country's banks, and only one (ScamShield) touches
localized/location-aware scam data. FraudLens AI's differentiators are
already ahead of everything reviewed here — the useful takeaways below are
mostly refinements, not gaps to close.

---

## 1. Detection signals & analysis (`backend/src/services/analysis/`)

- **Cross-check the signal taxonomy.** `Scam-Detector` scores messages
  against 12 deterministic factors: urgency, upfront-payment requests, poor
  grammar, suspicious hyperlinks, celebrity/authority name-dropping, reward
  bait, pressure tactics, unusual contact channel, fake-official mimicry,
  unsecured source, and blackmail/threats, backed by a 100+ term keyword
  list. Worth a quick diff against the current `signals[].type` values to
  confirm nothing in that list is silently uncovered (blackmail/threats and
  "unusual contact channel" look like the most likely gaps).
- **A deterministic keyword pre-scorer as an LLM-outage fallback.**
  `Scam-Detector`'s factor scores are all non-LLM (regex/keyword-driven).
  CLAUDE.md treats the hosted-API fallback as a blocking requirement, and
  BUILD-CHECKLIST.md already flags that fallback as the less reliable path
  under load. A tiny deterministic keyword/heuristic scorer (reusing the
  same idea as `checkUrls()`/`checkIdentityConsistency()`) could act as a
  last-resort verdict if *both* Ollama and the hosted fallback are
  unreachable, instead of a hard 502 — worth weighing against added scope
  this late, but it's a small, self-contained module if attempted.
- **Rank/label which signal mattered most.** `AI-Powered-...Phishing-Detection`
  uses SHAP to show the top-5 features driving a verdict. FraudLens already
  returns structured `signals[]` with `severity`, so this is mostly already
  satisfied — the only gap is there's no single "this is the #1 reason"
  callout in the UI. Could be a trivial frontend change (sort by severity,
  highlight the top one) rather than a backend change.

## 2. Domain / lookalike-URL matching (`backend/src/services/domain-matching/`)

- **Heuristic checklist to confirm coverage against**, from
  `AI-Powered-...Phishing-Detection`'s rule-based phishing-URL detector:
  IP-literal hostnames (`http://192.168.x.x/...`), the `user@host` trick,
  excessive subdomain counts, and heavy hyphenation
  (`mcb-secure-verify-login.top`). Quick sanity check against
  `backend/src/services/domain-matching/test-payloads.test.js` — if any of
  these aren't already exercised by Caellum's payload set, they're cheap
  regression cases to add.

## 3. Test payloads & QA methodology (`data/test-payloads/`, Caellum)

- **Evaluate on precision/recall/F1 per verdict class, not raw accuracy.**
  Both the Medium article and `fs_fraud_ml` hit the same wall: fraud/scam
  data is inherently imbalanced (safe messages vastly outnumber scams), so
  accuracy alone hides a model that just predicts "safe" most of the time.
  If a formal accuracy number ever gets quoted to the jury, report it
  per-class or as F1, not a single blended accuracy — this also pre-empts a
  "how did you validate this" jury question.
- **Treat false positives and false negatives as differently costly, and
  say so explicitly in the demo.** The Medium article's core warning:
  precision stayed low across every model on imbalanced data, i.e. lots of
  false alarms. For FraudLens specifically, a false positive (flagging a
  real bank SMS as a scam) erodes user trust in a way that's arguably worse
  than a missed borderline case — worth one deliberate sentence in the demo
  script framing this trade-off, since Presentation & Demonstration (15
  marks) rewards being able to "explain technical decisions."
- **`Scam-Detector`'s precomputed feature-vector CSV** (message + 12 numeric
  factor scores + label) is a clean, inspectable regression-test format —
  not needed for LLM-output payloads, but worth keeping in mind if the
  non-LLM `domain-matching`/`identity-consistency` modules ever want their
  own standalone fixture format separate from the existing payload JSON.
- **Avoid the failure mode `Financial-Fraud...XAI-FL` and `FraudAI` both hit**:
  `FraudAI` advertises 97.5% accuracy without mentioning class balance;
  `Financial-Fraud...XAI-FL` reports near-perfect precision/recall but
  *explicitly and admirably* caveats it as trained on a class-balanced
  subset with likely label leakage from the raw dataset. If FraudLens ever
  quotes a hit-rate number, follow the second project's honesty, not the
  first's — a caveated number survives jury Q&A; an uncaveated one invites
  it to be picked apart.

## 4. UI / structured output (`frontend/`, Oleg)

- **"Vulnerable-user protection mode" (currently unchecked in
  BUILD-CHECKLIST.md under Impact & Problem Solving) maps directly onto
  `ScamShield`'s accessibility patterns**: large fonts, plain-language
  explanations (no jargon), pre-written safety scripts the user can read
  back to a caller, and a "family alert" template/share action. These are
  UI-only — no backend change needed — and would let that checklist item get
  checked off cheaply by adding a simplified-language toggle or a "share
  this warning" template to `ResultView.tsx`/`result/parts.tsx`.
- **A "top reason" callout above the full signal list** (see §1) would make
  the structured breakdown scan faster during a live demo, which is exactly
  what Presentation & Demonstration rewards.
- **History / export patterns**: `AI-Powered-...Phishing-Detection`'s
  dashboard keeps a scan history with CSV/PDF export. The batch-scan summary
  view and `frontend/lib/storage.ts` (recent checks) already cover the
  history half of this — CSV/PDF export of a batch result is a small,
  optional nice-to-have if there's spare time near the end, not a gap.

## 5. Localization / Kreol support (`data/kreol-dataset/`, Joshua)

- **`Myth-Chaser`'s dialect-specific model (TunBERT for Tunisian Arabic) inside
  a weighted-voting ensemble** is the closest external analogue to Joshua's
  Kreol work — it validates the general approach (fine-tune/ground for a
  specific underrepresented dialect rather than relying on a generic
  multilingual model) but doesn't offer anything more concrete for Kreol
  Morisyen specifically, since no source here touches it. This is worth
  stating plainly in the demo/Q&A: *no comparable public project handles
  Kreol code-switching*, which is a genuine, defensible differentiation
  claim for the 25-mark Innovation criterion, not just a talking point.
- Myth-Chaser's graceful-degradation-on-model-failure pattern (weighted
  ensemble keeps voting even if one of seven models errors) is a reasonable
  robustness idea in the abstract, but adopting a multi-model ensemble is
  out of scope for the remaining time budget — flagging as "seen and
  deliberately not adopted" rather than a gap.

## 6. Ideas worth naming in the demo but explicitly NOT building

Given the reliability-first rubric priority in `CLAUDE.md`, these are worth
mentioning verbally as "future direction" rather than attempting in the
remaining hackathon window:

- **Payment-pause + trusted-contact approval flow** (the "Scam Guard" project
  referenced from `JingYuan0926`'s profile: pauses a suspicious bank
  transfer, does voice verification, requires a trusted contact to approve
  before funds move). This is a materially larger scope (payment-rail
  integration, contact management, voice verification) than "analyze a
  pasted message" — good one-liner for the "potential for scalability"
  criterion (25 marks, Impact & Problem Solving) without committing build
  time to it.
- **Location-aware local scam news feed** (`ScamShield`'s cascading
  city→region→country→global scam-news lookup). `frontend/app/trends/page.tsx`
  already exists as a trends surface — worth a quick look at what it
  currently shows, since this could be a natural (but optional) extension
  of a page that's already built, rather than new scope.
- **Live call-audio monitoring** (`ScamShield`'s real-time transcription +
  risk indicators during an active phone call). Interesting differentiator
  in principle but a different input modality entirely from FraudLens's
  paste-text/screenshot loop — out of scope, not worth mentioning as a
  near-term roadmap item since it implies a much bigger rebuild.

## 7. Not applicable / nothing to borrow

- `FinanceHacks` — boilerplate create-react-app scaffold with a financial-literacy
  chatbot; no fraud/scam detection logic at all.
- `FraudAI` (CapitalSavvy) and `fs_fraud_ml` — both pure tabular
  transaction-fraud classifiers (neural net / RandomForest+XGBoost+LightGBM+CatBoost).
  Different problem shape from message-text scam detection; the one
  transferable idea (tuning the decision threshold via F1 rather than using
  a default 0.5 cutoff) is already folded into §3 above.
- `PhishGuard` — openly a hackathon demo prototype with simulated results;
  useful only as a reminder to be as transparent about limitations as its
  README is.

---

## Appendix — one paragraph per source

1. **[SafePay-AI](https://github.com/NotArnav03/SafePay-AI)** — Flask +
   scikit-learn dual-model (TF-IDF/LogReg for SMS text, RandomForest for
   transaction risk), combined risk score with APPROVE/BLOCK output,
   glassmorphism dark-mode UI, preloaded demo scenarios for a fast live demo.
2. **[scamshield](https://github.com/NikhilChowdhury27/scamshield)** —
   Gemini-multimodal (live call audio + text + image) scam defense targeted
   at elderly users; accessibility-first UI, location-aware local scam news,
   pre-written safety scripts and family-alert templates.
3. **[phisguard-app](https://github.com/sabarniguha/phisguard-app)** — simple
   LogReg + keyword-highlighting phishing-email classifier, openly described
   by its author as a simulated hackathon demo, not real detection.
4. **[JingYuan0926 profile](https://github.com/JingYuan0926/JingYuan0926)** —
   hackathon portfolio; most relevant entry is "Scam Guard," which pauses a
   suspicious bank transfer pending ElevenLabs voice verification and
   trusted-contact approval.
5. **[Myth-Chaser](https://github.com/YassWorks/Myth-Chaser)** — FastAPI +
   Next.js misinformation/scam classifier using a 7-model weighted-voting
   ensemble (RoBERTa NLI, SBERT, ClaimBuster, Google Fact Check, a dialect
   model, and a Groq LLM), multi-format input (text/OCR/audio), immediate
   data disposal for privacy.
6. **[FraudAI](https://github.com/F4llow/FraudAI)** (CapitalSavvy) — TensorFlow
   dense NN on 550k transactions, 97.5% accuracy claim not adjusted for
   class imbalance, Gradio web interface.
7. **[Financial-Fraud...XAI-FL](https://github.com/shaikashfaaqhamja/Financial-Fraud-detection-using-Explainable-ai-and-Federating-Learning)**
   — RandomForest + LIME explainability on PaySim mobile-money data; openly
   documents its "federated learning" as a single-machine simulation and
   warns its own near-perfect metrics likely reflect label leakage and a
   class-balanced subset, not real-world performance.
8. **[Scam-Detector](https://github.com/Debottam1234567890/Scam-Detector)** —
   small Python/Flask tool scoring messages across 12 deterministic factors
   (urgency, payment requests, grammar, keyword lists, etc.) feeding a
   RandomForest classifier; no LLM, no localization.
9. **[FinanceHacks](https://github.com/Nikulp23/FinanceHacks)** — financial
   literacy education web app (bank/loan/credit-card comparisons + a
   chatbot); confirmed to have no fraud-detection logic, largely
   unmodified React/Node boilerplate.
10. **[Medium — Building Fraud Detection](https://medium.com/@pjab/building-fraud-detection-a-hackathon-challenge-for-data-enthusiasts-4b2c5d5275f1)**
    — hackathon writeup comparing XGBoost/RandomForest/LightGBM/CatBoost on
    imbalanced transaction data; core lesson is tuning the decision
    threshold and reporting precision/recall/F1 rather than accuracy.
11. **[fs_fraud_ml](https://github.com/intagen/fs_fraud_ml)** — single-script
    Kaggle-style exercise merging 8 CSVs of transaction data, engineering
    per-customer behavioral aggregates, SMOTE-resampling, and
    Optuna-tuning four gradient-boosting models; all models perform weakly
    (F1 ~0.17–0.21) on a tiny resampled set.
12. **[AI-Powered-Financial-Fraud-Phishing-Detection](https://github.com/ankitkumar14190/AI-Powered-Financial-Fraud-Phishing-Detection)**
    — Streamlit dashboard combining a RandomForest transaction-fraud model
    with rule-based phishing-URL heuristics into one weighted risk score,
    with SHAP explainability and optional VirusTotal enrichment.

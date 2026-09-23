# Community signals: cluster and wave detection

Owner: backend. Built on the `joshua` branch for backend-owner review. See `CLAUDE.md` → Role gating.

Turns community scam reports into **evidence-backed, audited** risk signals.
When many *different* people report the same scam pattern, and especially
when reports spike above the usual rate, the next person who checks a
matching message sees that, with the evidence behind it.

The whole path is deterministic and non-LLM. Everything in it can be tested
on its own, apart from the LLM call path, as root `CLAUDE.md` requires.

## Files

| File | Role |
|---|---|
| `fingerprint.js` | Pure. Normalized template hash + 64-bit SimHash of redacted text. |
| `wave.js` | Pure. Versioned rules (`WAVE_RULES_V1`, active `WAVE_RULES_V2`), matching, metrics, tier selection, REP-01/REP-02 signal builder. No score arithmetic. |
| `index.js` | Orchestration: DB reads/writes, reporter pseudonyms, audit log, retention purge. Never throws into `/api/analyze`. |
| `../../../scripts/seed-wave-demo.js` | Synthetic demo wave (`npm run seed:wave`), clearly tagged and removable. |

## Flow

```
POST /api/report ─► recordUserReport ─► report_events (origin=user_report, weight 1)

POST /api/analyze ─► runPipeline (services/pipeline)
                        1. evaluateCommunitySignal: redact + fingerprint, load last 22 days
                           of events, match (template | near-dup | host | sender),
                           metrics → tier (CW-1 / CW-2 / none) → REP-01 / REP-02 signal
                        2. risk engine (rs-1.0) scores all signals, incl. REP-01/02
                        3. recordCommunityOutcome: if a tier fired, write risk_audit_log
                           (rule, versions, points, level without/with, evidence ids);
                           if the decision is HIGH/CRITICAL AND a rule-sourced URL/ID
                           impersonation finding fired: record report_events
                           (origin=auto_high_confidence, weight 0.5)
```

Step 3 runs **after** step 1, so a message never counts as evidence for itself.

## Rules (`wave-rules-v2`, same thresholds as v1)

| Rule | Condition (all must hold) | Signal | Points (risk engine rs-1.0) |
|---|---|---|---|
| CW-1 `community_cluster` | ≥3 distinct reporters in 7d, ≥1 explicit user report, decayed weight ≥2 (7-day half-life) | REP-01 | 10 |
| CW-2 `community_wave` | CW-1 **and** ≥5 distinct reporters in 24h **and** 24h weight ≥3× the 14-day daily baseline (floor 0.5/day) | REP-02 | 20 |

Tiers are exclusive, so the points never stack. Matching:
- exact template hash;
- SimHash Hamming ≤6 (both templates must have ≥8 tokens);
- a shared lookalike host;
- a shared trackable sender key.

The SimHash threshold was measured on SMS-length variants:
- a one- or two-word edit scores 4–5;
- the same template aimed at a different bank scores about 11;
- unrelated scams score 28 or more.

**Decision policy** (owned by the risk engine, not this module):
- Crowd evidence alone is worth 10 (cluster) or 20 (wave) points, so it can reach `elevated` at most.
- Only `FLOOR-REP02-TECHNICAL` (a wave **plus** a rule-sourced URL/identity impersonation finding on the same message) lifts the level to `critical`.
- There is no LLM score to adjust any more; `adjustedRiskScore` is gone.

Thresholds never change in place. v2 exists because v1's per-tier `riskDelta` was added to the LLM score; v2 emits a signal instead. v1 stays so every past audit row remains explainable against the rules that produced it.

## Compliance controls

| Principle | Control |
|---|---|
| **Data minimisation** | No raw message text is stored, only a one-way template hash, a SimHash and lookalike hostnames, all computed after server-side `redact()`. No raw IP is stored, only `HMAC-SHA256(REPORTER_HASH_SECRET, ip)`. |
| **Storage limitation** | Evidence events are deleted after 90 days (`COMMUNITY_EVENT_RETENTION_DAYS`) and audit rows after 180 (`COMMUNITY_AUDIT_RETENTION_DAYS`). Purges run on boot and every 6h. |
| **Explainability** | The signal carries the rule ID, rule version, what matched and the counts behind it. It's never a bare score change. |
| **Auditability** | Every community contribution writes a `risk_audit_log` row: rule, versions (`wave-rules-v2+rs-1.0`), points, risk level without and with it (in the legacy `verdict_from`/`verdict_to` columns), evidence event IDs and metrics. `riskAdjustments[].auditRef` points to it. |
| **Reproducibility** | `wave.js` is pure over `(events, now, rules)`, so any decision can be recomputed. |
| **Integrity / anti-poisoning** | Only distinct reporters count. Explicit `/api/report` stays capped at 5 per hour per IP. Official identities (`MCB`, `my.t`, ...) and redaction placeholders are never used as sender keys. Messages whose links are all official domains are never boosted. |
| **No self-reinforcing AI** | Machine events count half and can never meet `minHumanReports`. They are only recorded for HIGH/CRITICAL decisions backed by a rule-sourced URL/identity finding, never on the strength of model output. |
| **Proportionality** | Crowd evidence is bounded (10 or 20 points) and only reaches `critical` together with a technical impersonation finding. |
| **Honest demo data** | Seeded rows are tagged `evidence.channel = "demo_seed"` and `npm run seed:wave -- --clear` removes only them. |

This is a pragmatic reading of data-protection principles (for example
Mauritius's Data Protection Act 2017: minimisation, purpose limitation and
storage limitation). It hasn't been through a legal review.

## Also fixed here

- **`senderReports` for redacted senders.** The frontend redacts phone numbers before `/api/analyze`, so the LLM's `sender` was often `[phone 1]`, which `normalizeSender()` collapsed into one shared key `"2301"`. `senderReports` is now omitted for placeholders.
- **Brand reputation poisoning.** A scam claiming to be `MCB` used to add to the count for `mcb`, so genuine MCB messages looked community-flagged. `senderReports` is now omitted for official identities.

## Known gaps / follow-ups

- **Frontend:** show the REP-01/REP-02 signal (`communityEvidence`) and `riskAdjustments`; the `trace` already lists its points.
- **Frontend:** send the real sender alongside `/api/analyze` (for example as a hash), so a message's sender key matches the key its reports are stored under. Today the two only line up when the sender survives redaction.
- **Demo risk:** `REPORTER_HASH_SECRET` should be set in the demo deployment, or distinct-reporter counts reset on every restart.
- The `description` is English-only. The Kreol and French copy belongs in the frontend `i18n`.

## Demo script

See the header of `backend/scripts/seed-wave-demo.js`. In short:
1. Seed the wave.
2. Analyze a variant of the seeded message. The REP-02 signal appears with its evidence, and the trace shows FLOOR-REP02-TECHNICAL.
3. Analyze a genuine `mcb.mu` message. It gets no boost.
4. Clear the seeded rows.

Say out loud that the seeded reports are simulated.

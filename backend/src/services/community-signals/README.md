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
| `wave.js` | Pure. Versioned rules (`WAVE_RULES_V1`), matching, metrics, tier selection, verdict policy. |
| `index.js` | Orchestration: DB reads/writes, reporter pseudonyms, audit log, retention purge. Never throws into `/api/analyze`. |
| `../../../scripts/seed-wave-demo.js` | Synthetic demo wave (`npm run seed:wave`), clearly tagged and removable. |

## Flow

```
POST /api/report ─► recordUserReport ─► report_events (origin=user_report, weight 1)

POST /api/analyze ─► LLM + deterministic checks ─► riskCategories
                 ─► withSenderReports ─► applyCommunityEvidence
                        1. redact + fingerprint the analyzed text
                        2. load last 22 days of events, match (template | near-dup | host | sender)
                        3. metrics → tier (CW-1 / CW-2 / none)
                        4. if tier: add community_* signal, adjustedRiskScore,
                           riskAdjustments[auditRef], write risk_audit_log row
                        5. if verdict was scam AND a deterministic high signal fired:
                           record report_events (origin=auto_high_confidence, weight 0.5)
```

Step 5 runs **after** step 2–4, so a message never counts as evidence for itself.

## Rules (`wave-rules-v1`)

| Rule | Condition (all must hold) | Signal | Δ riskScore |
|---|---|---|---|
| CW-1 `community_cluster` | ≥3 distinct reporters in 7d, ≥1 explicit user report, decayed weight ≥2 (7-day half-life) | medium | +10 |
| CW-2 `community_wave` | CW-1 **and** ≥5 distinct reporters in 24h **and** 24h weight ≥3× the 14-day daily baseline (floor 0.5/day) | high | +20 |

Tiers are exclusive, so the delta never stacks. Matching:
- exact template hash;
- SimHash Hamming ≤6 (both templates must have ≥8 tokens);
- a shared lookalike host;
- a shared trackable sender key.

The SimHash threshold was measured on SMS-length variants:
- a one- or two-word edit scores 4–5;
- the same template aimed at a different bank scores about 11;
- unrelated scams score 28 or more.

**Verdict policy:**
- Crowd evidence alone lifts `safe` to `suspicious`, and never further.
- `suspicious` becomes `scam` only on CW-2 **plus** a `url_parser` or `identity_check` high-severity signal on the same message.
- A verdict is never lowered.
- The LLM's `riskScore` is kept. The adjusted value goes in `adjustedRiskScore`.

Thresholds never change in place. Add `WAVE_RULES_V2` and switch `ACTIVE_RULES`, so every past audit row stays explainable against the rules that produced it.

## Compliance controls

| Principle | Control |
|---|---|
| **Data minimisation** | No raw message text is stored, only a one-way template hash, a SimHash and lookalike hostnames, all computed after server-side `redact()`. No raw IP is stored, only `HMAC-SHA256(REPORTER_HASH_SECRET, ip)`. |
| **Storage limitation** | Evidence events are deleted after 90 days (`COMMUNITY_EVENT_RETENTION_DAYS`) and audit rows after 180 (`COMMUNITY_AUDIT_RETENTION_DAYS`). Purges run on boot and every 6h. |
| **Explainability** | The signal carries the rule ID, rule version, what matched and the counts behind it. It's never a bare score change. |
| **Auditability** | Every adjustment writes a `risk_audit_log` row: rule, version, delta, verdict before and after, evidence event IDs and metrics. `riskAdjustments[].auditRef` points to it. |
| **Reproducibility** | `wave.js` is pure over `(events, now, rules)`, so any decision can be recomputed. |
| **Integrity / anti-poisoning** | Only distinct reporters count. Explicit `/api/report` stays capped at 5 per hour per IP. Official identities (`MCB`, `my.t`, ...) and redaction placeholders are never used as sender keys. Messages whose links are all official domains are never boosted. |
| **No self-reinforcing AI** | Machine events count half and can never meet `minHumanReports`, so past LLM verdicts can't raise future ones. Machine events are only recorded when a check that doesn't use the LLM backs up the scam verdict. |
| **Proportionality** | The boost is bounded (+10 or +20) and escalation is capped as described above. |
| **Honest demo data** | Seeded rows are tagged `evidence.channel = "demo_seed"` and `npm run seed:wave -- --clear` removes only them. |

This is a pragmatic reading of data-protection principles (for example
Mauritius's Data Protection Act 2017: minimisation, purpose limitation and
storage limitation). It hasn't been through a legal review.

## Also fixed here

- **`senderReports` for redacted senders.** The frontend redacts phone numbers before `/api/analyze`, so the LLM's `sender` was often `[phone 1]`, which `normalizeSender()` collapsed into one shared key `"2301"`. `senderReports` is now omitted for placeholders.
- **Brand reputation poisoning.** A scam claiming to be `MCB` used to add to the count for `mcb`, so genuine MCB messages looked community-flagged. `senderReports` is now omitted for official identities.

## Known gaps / follow-ups

- **Frontend:** show `community_*` signals, `adjustedRiskScore` and `riskAdjustments`. When a verdict is escalated, `explanation` and `suggestedAction` are still the LLM's, so the UI should show the community signal's `description` next to them.
- **Frontend:** send the real sender alongside `/api/analyze` (for example as a hash), so a message's sender key matches the key its reports are stored under. Today the two only line up when the sender survives redaction.
- **Demo risk:** `REPORTER_HASH_SECRET` should be set in the demo deployment, or distinct-reporter counts reset on every restart.
- The `description` is English-only. The Kreol and French copy belongs in the frontend `i18n`.

## Demo script

See the header of `backend/scripts/seed-wave-demo.js`. In short:
1. Seed the wave.
2. Analyze a variant of the seeded message. The CW-2 signal appears with its evidence.
3. Analyze a genuine `mcb.mu` message. It gets no boost.
4. Clear the seeded rows.

Say out loud that the seeded reports are simulated.

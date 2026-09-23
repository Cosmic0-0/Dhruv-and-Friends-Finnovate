// Translation metrics that need no model and no dependency.
//
// chrF is a character n-gram F-score (Popovic 2015): robust for a morphologically
// loose, non-standardised language like Kreol, where word-level BLEU punishes
// harmless respellings. It is a *corpus-similarity* signal only. For FraudLens
// the meaning-critical checks (entities, negation, numbers, language) in
// translation.js validateTranslation() matter more than any similarity score:
// "Send me OTP 428911" can score high chrF and still be unacceptable.

const MAX_N = 6;
const BETA = 2;

function ngrams(chars, n) {
  const counts = new Map();
  for (let i = 0; i + n <= chars.length; i++) {
    const g = chars.slice(i, i + n).join("");
    counts.set(g, (counts.get(g) || 0) + 1);
  }
  return counts;
}

/**
 * @param {string} hypothesis
 * @param {string} reference
 * @returns {number} 0-100
 */
export function chrF(hypothesis, reference) {
  const hyp = [...String(hypothesis).replace(/\s+/g, "")];
  const ref = [...String(reference).replace(/\s+/g, "")];
  if (hyp.length === 0 || ref.length === 0) return hyp.length === ref.length ? 100 : 0;
  let precisionSum = 0;
  let recallSum = 0;
  let orders = 0;
  for (let n = 1; n <= MAX_N; n++) {
    const h = ngrams(hyp, n);
    const r = ngrams(ref, n);
    const hTotal = Math.max(hyp.length - n + 1, 0);
    const rTotal = Math.max(ref.length - n + 1, 0);
    if (hTotal === 0 || rTotal === 0) continue;
    let overlap = 0;
    for (const [g, c] of h) overlap += Math.min(c, r.get(g) || 0);
    precisionSum += overlap / hTotal;
    recallSum += overlap / rTotal;
    orders++;
  }
  if (orders === 0) return 0;
  const p = precisionSum / orders;
  const r = recallSum / orders;
  if (p === 0 && r === 0) return 0;
  const score = ((1 + BETA ** 2) * p * r) / (BETA ** 2 * p + r);
  return Math.round(score * 10000) / 100;
}

import { SCAM_STAGES, type AnalyzeResponse } from "./types.ts";

/** Keep the strongest observed stage and its matching playbook reasons together.
 * Missing or lower-stage messages must not reset the conversation's progress. */
export function furthestJourney(responses: readonly AnalyzeResponse[]): AnalyzeResponse | undefined {
  return responses.reduce<AnalyzeResponse | undefined>((best, response) => {
    const stage = response.journey?.currentStage;
    if (!stage || !SCAM_STAGES.includes(stage)) return best;
    return !best?.journey || SCAM_STAGES.indexOf(stage) > SCAM_STAGES.indexOf(best.journey.currentStage) ? response : best;
  }, undefined);
}

/** Read-only campaign intelligence and bounded educational simulations. */
export interface Campaign {
  fingerprintId: string;
  scamType: string;
  claimedIdentity: string | null;
  messageCount: number;
  senders: string[];
  domains: string[];
}
export interface TrendsSummary {
  totals: { reportedSenders: number; totalReports: number; campaigns: number; domains: number };
  topSenders: { sender: string; reportCount: number }[];
  topCampaigns: { fingerprintId: string; scamType: string; claimedIdentity: string | null; messageCount: number }[];
  scamTypeCounts: { scamType: string; campaigns: number; messages: number }[];
}
export interface SandboxPlaybook { scamType: string; label: string; typicalStages: string[] }
export interface SandboxCatalog { playbooks: SandboxPlaybook[]; maxTurns: number }
export interface SandboxTurn {
  simulated: true; ended: boolean; scamType: string; stage: string; turnIndex: number;
  line: string | null; tactic: { label: string; explanation: string };
  source: "llm" | "scripted" | "ended"; nextStage: string | null; typicalStages: string[];
}
const obj = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null;
const strings = (x: unknown): x is string[] => Array.isArray(x) && x.every(v => typeof v === "string");
async function request<T>(path: string, valid: (x: unknown) => x is T, signal?: AbortSignal, body?: unknown): Promise<T> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal?.addEventListener("abort", abort, { once: true });
  if (signal?.aborted) controller.abort();
  const timer = setTimeout(abort, body ? 135_000 : 15_000);
  try {
    const response = await fetch(path, { signal: controller.signal, ...(body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}) });
    if (!response.ok) throw new Error(response.status === 404 ? "This campaign could not be found. Run another message check to explore its connections." : "We couldn’t load this right now. Please try again.");
    const data: unknown = await response.json();
    if (!valid(data)) throw new Error("The response was incomplete. Please try again.");
    return data;
  } catch (error) {
    if (error instanceof Error && !["TypeError", "AbortError"].includes(error.name)) throw error;
    throw new Error("We couldn’t reach FraudLens. Please check your connection and try again.");
  } finally { clearTimeout(timer); signal?.removeEventListener("abort", abort); }
}
export const getCampaign = (id: string, signal?: AbortSignal) => request<Campaign>(`/api/campaign/${encodeURIComponent(id)}`, (x): x is Campaign => obj(x) && typeof x.fingerprintId === "string" && typeof x.scamType === "string" && (x.claimedIdentity === null || typeof x.claimedIdentity === "string") && typeof x.messageCount === "number" && strings(x.senders) && strings(x.domains), signal);
export const getTrends = (signal?: AbortSignal) => request<TrendsSummary>("/api/trends", (x): x is TrendsSummary => obj(x) && obj(x.totals) && typeof x.totals.reportedSenders === "number" && typeof x.totals.totalReports === "number" && typeof x.totals.campaigns === "number" && typeof x.totals.domains === "number" && Array.isArray(x.topSenders) && x.topSenders.every(s => obj(s) && typeof s.sender === "string" && typeof s.reportCount === "number") && Array.isArray(x.topCampaigns) && x.topCampaigns.every(c => obj(c) && typeof c.fingerprintId === "string" && typeof c.scamType === "string" && (c.claimedIdentity === null || typeof c.claimedIdentity === "string") && typeof c.messageCount === "number") && Array.isArray(x.scamTypeCounts) && x.scamTypeCounts.every(s => obj(s) && typeof s.scamType === "string" && typeof s.campaigns === "number" && typeof s.messages === "number"), signal);
export const getSandboxCatalog = (signal?: AbortSignal) => request<SandboxCatalog>("/api/sandbox/playbooks", (x): x is SandboxCatalog => obj(x) && typeof x.maxTurns === "number" && Array.isArray(x.playbooks) && x.playbooks.every(p => obj(p) && typeof p.scamType === "string" && typeof p.label === "string" && strings(p.typicalStages)), signal);
export const nextSandboxTurn = (body: { scamType: string; stage: string; turnIndex: number }, signal?: AbortSignal) => request<SandboxTurn>("/api/sandbox/next", (x): x is SandboxTurn => obj(x) && x.simulated === true && typeof x.ended === "boolean" && typeof x.scamType === "string" && typeof x.stage === "string" && typeof x.turnIndex === "number" && (x.line === null || typeof x.line === "string") && obj(x.tactic) && typeof x.tactic.label === "string" && typeof x.tactic.explanation === "string" && ["llm", "scripted", "ended"].includes(String(x.source)) && (x.nextStage === null || typeof x.nextStage === "string") && strings(x.typicalStages), signal, body);

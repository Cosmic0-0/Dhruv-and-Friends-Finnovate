"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useLanguage } from "./LanguageProvider";
import { intelligenceCopy } from "@/lib/intelligence-copy";
import ReactFlow, { Background, Controls, Handle, Position, useNodesState, useEdgesState, type Node, type NodeProps } from "reactflow";
import "reactflow/dist/style.css";
import { checkSender } from "@/lib/api";
import { getCampaign, type Campaign } from "@/lib/intelligence-api";

type Entity = { kind: "Campaign" | "Claimed identity" | "Sender" | "Domain"; label: string; detail: string; count?: number; flagged?: boolean };
function IntelligenceNode({ data, selected }: NodeProps<Entity>) {
  const { lang } = useLanguage();
  const t = intelligenceCopy(lang);
  return <div className={`w-56 border bg-card p-4 shadow-sm transition-shadow ${selected ? "border-accent-deep ring-2 ring-accent/25" : "border-card-border"} ${data.kind === "Campaign" ? "!bg-surface-dark text-on-ink" : "text-ink"}`}>
    <Handle type="target" position={Position.Left} className="!size-2 !border-0 !bg-accent" />
    <div className="flex items-center justify-between gap-2"><span className="micro opacity-65">{t(data.kind)}</span><span className={`size-2 ${data.flagged ? "bg-danger" : "bg-accent"}`} /></div>
    <p className="mt-2 break-words font-mono text-sm font-medium">{data.label}</p>
    <p className="mt-2 text-xs opacity-65">{t(data.detail)}</p>
    <Handle type="source" position={Position.Right} className="!size-2 !border-0 !bg-accent" />
  </div>;
}
const nodeTypes = { intelligence: IntelligenceNode };

export default function FraudNetworkGraph({ fingerprintId }: { fingerprintId: string }) {
  const { lang } = useLanguage();
  const t = intelligenceCopy(lang);
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [nodes, setNodes, onNodesChange] = useNodesState<Entity>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [selected, setSelected] = useState<Entity | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError(""); setSelected(null);
    async function load() {
      try {
        const data = await getCampaign(fingerprintId, controller.signal);
        const reputations = await Promise.all(data.senders.map(sender => checkSender({ sender }, { signal: controller.signal })));
        if (controller.signal.aborted) return;
        const campaignNode: Node<Entity> = { id: "campaign", type: "intelligence", position: { x: 340, y: 160 }, data: { kind: "Campaign", label: data.scamType.replaceAll("_", " "), detail: `${data.messageCount} observed checks` } };
        const entities: Node<Entity>[] = [campaignNode];
        if (data.claimedIdentity) entities.push({ id: "identity", type: "intelligence", position: { x: 0, y: 160 }, data: { kind: "Claimed identity", label: data.claimedIdentity, detail: "Impersonated name · not an accusation" } });
        data.senders.forEach((sender, i) => {
          const reputation = reputations[i];
          const count = reputation.ok ? reputation.data.reportCount : undefined;
          entities.push({ id: `sender-${i}`, type: "intelligence", position: { x: 680, y: i * 145 }, data: { kind: "Sender", label: sender, count, flagged: count !== undefined && count > 0, detail: count === undefined ? "Report count unavailable" : `${count} community reports` } });
        });
        data.domains.forEach((domain, i) => entities.push({ id: `domain-${i}`, type: "intelligence", position: { x: 340, y: 370 + i * 145 }, data: { kind: "Domain", label: domain, detail: "Observed in a flagged link", flagged: true } }));
        setCampaign(data); setNodes(entities); setSelected(campaignNode.data);
        setEdges(entities.filter(n => n.id !== "campaign").map(n => ({ id: `link-${n.id}`, source: "campaign", target: n.id, type: "smoothstep", style: { stroke: "var(--color-accent)", strokeWidth: 1.5 } })));
      } catch (err) { if (!controller.signal.aborted) setError(err instanceof Error ? err.message : "Could not load this network."); }
      finally { if (!controller.signal.aborted) setLoading(false); }
    }
    void load(); return () => controller.abort();
  }, [fingerprintId, attempt, setNodes, setEdges]);
  return <div className="gutter space-y-6 py-8">
    <Link href="/" className="micro text-accent-ink hover:underline">{t("← Message check")}</Link>
    <header className="flex flex-wrap items-end justify-between gap-4 border-b border-card-border pb-6"><div><p className="micro mb-3 text-accent-ink">{t("Campaign intelligence / ScamDNA")}</p><h1>{t("Follow the connections.")}</h1><p className="mt-3 max-w-xl text-ink-soft">{t("Explore the senders, claimed identity and links observed in this scam pattern.")}</p></div>{campaign && <div className="flex gap-6">{[[campaign.messageCount, "Checks"], [campaign.senders.length, "Senders"], [campaign.domains.length, "Domains"]].map(([count, label]) => <div key={label}><p className="font-heading text-3xl">{count}</p><p className="micro text-ink-muted">{t(String(label))}</p></div>)}</div>}</header>
    {loading ? <div role="status" className="flex h-96 items-center justify-center border border-card-border bg-card text-ink-muted"><span className="mr-3 size-4 animate-spin rounded-full border-2 border-accent border-t-transparent" />{t("Mapping observed connections…")}</div> : error ? <div role="alert" className="border-l-2 border-danger bg-danger-soft p-6"><p>{error}</p><button onClick={() => setAttempt(n => n + 1)} className="mt-4 text-sm font-semibold underline">{t("Try again")}</button></div> : <>
      <div className="grid gap-0 overflow-hidden border border-card-border bg-card lg:grid-cols-[1fr_260px]">
        <div className="h-[480px] min-w-0 md:h-[570px]" role="region" aria-label="Interactive fraud network. Drag nodes, zoom, or select an entity for details.">
          <ReactFlow nodes={nodes} edges={edges} nodeTypes={nodeTypes} onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onNodeClick={(_, node) => setSelected(node.data)} fitView fitViewOptions={{ padding: 0.25 }} minZoom={0.2} maxZoom={1.8} nodesConnectable={false} proOptions={{ hideAttribution: true }}><Background color="var(--color-card-border)" gap={22} /><Controls showInteractive={false} /></ReactFlow>
        </div>
        <aside className="border-t border-card-border bg-page/60 p-5 lg:border-t-0 lg:border-l" aria-live="polite"><p className="micro mb-5 text-ink-muted">{t("Entity inspector")}</p>{selected && <><p className="micro text-accent-ink">{t(selected.kind)}</p><h2 className="mt-3 break-words text-xl">{selected.label}</h2><dl className="mt-6 text-sm"><div className="border-t border-card-border py-3"><dt className="text-ink-muted">{t("Observation")}</dt><dd className="mt-1 leading-relaxed">{t(selected.detail)}</dd></div><div className="border-t border-card-border py-3"><dt className="text-ink-muted">{t("Connection")}</dt><dd className="mt-1">{t("Shared scam type and claimed identity")}</dd></div></dl></>}<p className="mt-6 border-t border-card-border pt-4 text-xs leading-relaxed text-ink-muted">{t("Connections show a shared observed pattern. They do not prove a common operator or wrongdoing by the impersonated institution.")}</p></aside>
      </div>
      <details className="border-b border-card-border pb-4"><summary className="cursor-pointer text-sm text-ink-soft">{t("View accessible entity list ·")} {nodes.length} {t("entities")}</summary><ul className="mt-4 divide-y divide-card-border">{nodes.map(node => <li key={node.id}><button onClick={() => setSelected(node.data)} className="flex w-full flex-wrap justify-between gap-2 py-3 text-left text-sm"><span className="break-all">{t(node.data.kind)}: {node.data.label}</span><span className="text-ink-muted">{t(node.data.detail)}</span></button></li>)}</ul></details>
    </>}
  </div>;
}

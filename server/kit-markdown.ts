import type { RunRecord } from "@/src/types";

export function kitToMarkdown(rec: RunRecord): string {
  const b = rec.brief;
  const head = `# ${b.product}\n\n> ${b.oneLiner}\n\n_Audience: ${b.audience} · Tone: ${b.tone}_\n`;
  if (!rec.kit) {
    return `${head}\n**Run status: ${rec.status}.** No composed kit was produced${rec.assets.length ? " — some legs completed, see provenance." : "."}\n`;
  }
  const k = rec.kit;
  const prov = k.provenance.map((p) => `- **${p.leg}** — ${p.agentName} · $${p.amountUsd} · \`${p.contentHash}\` · [Basescan ↗](${p.basescanUrl})`).join("\n");
  return [
    head,
    `## Landing copy\n\n${k.landingCopy || "(none)"}`,
    `## OG image\n\n${/^https?:\/\//.test(k.ogImageRef) ? `![og image](${k.ogImageRef})` : `Asset reference: \`${k.ogImageRef}\``}`,
    `## Tweet thread\n\n${k.tweetThread.map((t, i) => `${i + 1}. ${t}`).join("\n")}`,
    `## Short pitch\n\n${k.shortPitch}`,
    `## Product Hunt / HN blurb\n\n${k.phHnBlurb}`,
    `## README intro\n\n${k.readmePolish}`,
    `## Provenance (on-chain)\n\n${prov}`,
    `\n_Delivered by Praeco — run ${rec.runId} · spent $${(Number(rec.spentBaseUnits) / 1e6).toFixed(2)} USDC._`,
  ].join("\n\n");
}

export function kitProvenanceJson(rec: RunRecord): string {
  return JSON.stringify({ runId: rec.runId, status: rec.status, spentBaseUnits: rec.spentBaseUnits, provenance: rec.kit?.provenance ?? rec.assets.map((a) => a.provenance) }, null, 2);
}

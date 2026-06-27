/**
 * The agent's toolbelt. GLM-5.2 drives a launch job by calling these. Each tool
 * is a deterministic, money-aware primitive: discovery and schema reads are
 * free; hire_specialist is the only spending tool and is itself guarded
 * (per-leg price cap + wallet funding via assertPayable) on top of the loop's
 * beforeToolCall budget gate. State flows through the shared RunContext.
 */
import { Type } from "@earendil-works/pi-ai";
import type { AgentTool, AgentToolResult } from "@earendil-works/pi-agent-core";
import type { RunContext } from "./context.js";
import type { LegKind, ServiceCandidate } from "../types.js";
import { searchServices, resolveCandidate, rankCandidates } from "../cap/discovery.js";
import { hireSpecialist } from "../cap/hire.js";
import { assertFunded } from "../cap/wallet.js";
import { reviewDeliverable } from "./qa.js";
import { toProvenanceCard, deliverableToText } from "./provenance.js";
import { baseUnitsToUsd } from "../constants.js";

const usd = (b: string) => baseUnitsToUsd(BigInt(b));
const text = (s: string, details: unknown = {}): AgentToolResult<unknown> => ({ content: [{ type: "text", text: s }], details });

export function buildTools(ctx: RunContext): AgentTool<any>[] {
  const search: AgentTool<any> = {
    name: "search_marketplace",
    label: "Search marketplace",
    description: "Find specialist agents for a leg (research | landing_copy | og_image). Returns ranked candidates with price, reputation, and required input fields.",
    parameters: Type.Object({
      leg: Type.String({ description: "research | landing_copy | og_image" }),
      query: Type.String({ description: "search keywords, e.g. 'SEO audit' or 'landing page copy'" }),
    }),
    execute: async (_id, params: any) => {
      const leg = params.leg as LegKind;
      ctx.worklog.emit({ kind: "leg_search", at: Date.now(), leg, message: `searching: ${params.query}` });
      const hits = await searchServices(ctx.config.apiUrl, params.query, ctx.fetchImpl);
      const resolved: ServiceCandidate[] = [];
      for (const h of hits.slice(0, 5)) {
        try {
          const c = await resolveCandidate(ctx.config.apiUrl, h.serviceId, h.agentId, ctx.fetchImpl);
          ctx.candidates.set(c.serviceId, c);
          resolved.push(c);
        } catch (e) {
          ctx.worklog.emit({ kind: "error", at: Date.now(), leg, message: `could not resolve ${h.serviceId}: ${(e as Error).message}` });
        }
      }
      const ranked = rankCandidates(resolved, { preferredServiceId: ctx.config.preferredServiceIds[leg] });
      for (const c of ranked) {
        ctx.worklog.emit({ kind: "leg_candidate", at: Date.now(), leg, message: `${c.agentName} (${c.serviceId}) $${usd(c.priceBaseUnits)} rate ${(c.completionRate * 100).toFixed(1)}%` });
      }
      if (ranked.length === 0) return text(`No candidates found for "${params.query}". Try different keywords.`, { count: 0 });
      const summary = ranked
        .map((c) => `- serviceId=${c.serviceId} agent="${c.agentName}" price=$${usd(c.priceBaseUnits)} completionRate=${(c.completionRate * 100).toFixed(1)}% orders=${c.completedOrders} requires=[${c.requirementSchema.map((f) => f.name + (f.required ? "*" : "")).join(", ")}]`)
        .join("\n");
      return text(`Candidates for ${leg} (best first):\n${summary}\n\nNext: get_service_schema, then hire_specialist with the best candidate.`, { candidates: ranked.map((c) => c.serviceId) });
    },
  };

  const schema: AgentTool<any> = {
    name: "get_service_schema",
    label: "Get service schema",
    description: "Return the exact required input fields for a discovered service so you can fill them for hire_specialist.",
    parameters: Type.Object({ serviceId: Type.String() }),
    execute: async (_id, params: any) => {
      const c = ctx.candidates.get(String(params.serviceId));
      if (!c) throw new Error(`unknown serviceId ${params.serviceId} — call search_marketplace first`);
      if (c.requirementType === "text") return text(`Service ${c.serviceId} accepts a free-text brief: ${c.requirementText ?? "(describe the job)"}`, { requirementType: "text" });
      const fields = c.requirementSchema.map((f) => `${f.name}: ${f.type}${f.required ? " (required)" : ""}`).join("\n");
      return text(`Service ${c.serviceId} requires:\n${fields}\n\nPass these as hire_specialist.requirements (a JSON object).`, { schema: c.requirementSchema });
    },
  };

  const hire: AgentTool<any> = {
    name: "hire_specialist",
    label: "Hire specialist",
    description: "Negotiate, pay USDC, and receive a deliverable from a discovered service. Only call after search_marketplace. Returns an orderId to QA next.",
    parameters: Type.Object({
      leg: Type.String(),
      serviceId: Type.String(),
      requirements: Type.Record(Type.String(), Type.Any(), { description: "input object matching the service's schema" }),
    }),
    execute: async (_id, params: any) => {
      const leg = params.leg as LegKind;
      const c = ctx.candidates.get(String(params.serviceId));
      if (!c) throw new Error(`unknown serviceId ${params.serviceId} — call search_marketplace first`);
      const assertPayable = async (price: bigint) => {
        await assertFunded(ctx.config.rpcUrl, ctx.config.agentWallet, ctx.config.usdcTokenAddress, price, ctx.fetchImpl);
        if (!ctx.budget.canAfford(price)) throw new Error(`price ${baseUnitsToUsd(price)} exceeds remaining run budget ${baseUnitsToUsd(ctx.budget.remaining())}`);
      };
      const result = await hireSpecialist(
        ctx.client,
        { leg, serviceId: c.serviceId, agentId: c.agentId, agentName: c.agentName, requirements: params.requirements as Record<string, unknown>, priceCapBaseUnits: ctx.budget.legCap(), assertPayable },
        (e) => ctx.worklog.emit(e),
        ctx.hirePollOpts,
      );
      ctx.budget.commit(BigInt(result.priceBaseUnits));
      ctx.paidOrderIds.add(result.orderId);
      ctx.pendingHires.set(result.orderId, result);
      const preview = deliverableToText(result.deliverable).slice(0, 500);
      return text(`Hired ${c.agentName} for ${leg}. orderId=${result.orderId}. Deliverable preview:\n${preview}\n\nNext: qa_review this orderId.`, { orderId: result.orderId });
    },
  };

  const qa: AgentTool<any> = {
    name: "qa_review",
    label: "QA review",
    description: "Critique a delivered asset against the brief. Returns accept | redo | swap.",
    parameters: Type.Object({ orderId: Type.String() }),
    execute: async (_id, params: any) => {
      const h = ctx.pendingHires.get(String(params.orderId));
      if (!h) throw new Error(`unknown orderId ${params.orderId}`);
      const verdict = await reviewDeliverable(ctx.llm, ctx.brief, h.leg, h.deliverable);
      ctx.verdicts.set(h.orderId, verdict);
      ctx.worklog.emit({ kind: "qa_verdict", at: Date.now(), leg: h.leg, message: `QA ${verdict.action}: ${verdict.reason}`, data: { score: verdict.score } });
      const guidance =
        verdict.action === "accept" ? "Call submit_asset with this orderId." :
        verdict.action === "redo" ? "Re-hire the same provider with improved requirements." :
        "Hire a different provider for this leg.";
      return text(`QA verdict: ${verdict.action} (score ${verdict.score ?? "n/a"}). ${verdict.reason}\n${guidance}`, { verdict });
    },
  };

  const submit: AgentTool<any> = {
    name: "submit_asset",
    label: "Submit asset",
    description: "Finalize a QA-accepted deliverable as the asset for its leg. Only call after qa_review returns accept.",
    parameters: Type.Object({ orderId: Type.String() }),
    execute: async (_id, params: any) => {
      const h = ctx.pendingHires.get(String(params.orderId));
      if (!h) throw new Error(`unknown orderId ${params.orderId}`);
      const verdict = ctx.verdicts.get(h.orderId);
      if (!verdict || verdict.action !== "accept") throw new Error(`order ${h.orderId} has not passed QA — run qa_review until it returns accept`);
      ctx.assets.set(h.leg, { leg: h.leg, hire: h, verdict, provenance: toProvenanceCard(h) });
      ctx.worklog.emit({ kind: "asset_submitted", at: Date.now(), leg: h.leg, message: `asset submitted for ${h.leg}` });
      const done = ctx.requiredLegs.every((l) => ctx.assets.has(l));
      const msg = done
        ? `All ${ctx.requiredLegs.length} legs complete. Stop now.`
        : `${ctx.assets.size}/${ctx.requiredLegs.length} legs done. Move on to the next leg.`;
      return { content: [{ type: "text", text: msg }], details: { leg: h.leg, done }, terminate: done };
    },
  };

  return [search, schema, hire, qa, submit];
}

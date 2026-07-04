/**
 * Loop-level money guard. The agent (GLM-5.2) decides WHAT to hire; this guard
 * decides whether the loop is ALLOWED to run the hire — enforced by
 * pi-agent-core's beforeToolCall hook, which runs after args are validated and
 * before the tool executes. It is the hard ceiling the LLM cannot talk past.
 * attachTurnGuard is the runaway backstop.
 */
import type { Agent, BeforeToolCallContext, BeforeToolCallResult } from "@earendil-works/pi-agent-core";
import type { RunContext } from "./context.js";
import type { LegKind } from "../types.js";
import { baseUnitsToUsd, MAX_PAID_ATTEMPTS_PER_LEG } from "../constants.js";

export function makeBeforeToolCall(
  ctx: RunContext,
): (c: BeforeToolCallContext) => Promise<BeforeToolCallResult | undefined> {
  return async ({ toolCall, args }) => {
    if (toolCall.name !== "hire_specialist") return undefined;
    const a = args as { leg?: LegKind; serviceId?: string };
    const block = (reason: string): BeforeToolCallResult => {
      ctx.worklog.emit({ kind: "hire_blocked", at: Date.now(), leg: a.leg, message: reason });
      return { block: true, reason };
    };
    if (a.leg && ctx.assets.has(a.leg)) return block(`leg ${a.leg} already has a submitted asset — do not hire it again`);
    if (a.leg && (ctx.paidAttemptsByLeg?.get(a.leg) ?? 0) >= MAX_PAID_ATTEMPTS_PER_LEG) {
      return block(`leg ${a.leg} reached the ${MAX_PAID_ATTEMPTS_PER_LEG}-paid-hire cap without a QA-accepted asset — stop hiring for this leg and finish with the legs you have`);
    }
    if (a.leg && a.serviceId && ctx.escapedPins?.has(a.leg) && a.serviceId === ctx.config.preferredServiceIds[a.leg]) {
      return block(`pinned provider ${a.serviceId} was abandoned after failing QA on ${a.leg} — hire a DIFFERENT provider for this leg`);
    }
    const c = a.serviceId ? ctx.candidates.get(a.serviceId) : undefined;
    if (!c) return block(`serviceId ${a.serviceId ?? "(none)"} was not discovered — call search_marketplace first`);
    const price = BigInt(c.priceBaseUnits);
    if (ctx.budget.exceedsLegCap(price)) return block(`price $${baseUnitsToUsd(price)} exceeds the per-leg cap $${baseUnitsToUsd(ctx.budget.legCap())}`);
    if (!ctx.budget.canAfford(price)) return block(`price $${baseUnitsToUsd(price)} exceeds the remaining run budget $${baseUnitsToUsd(ctx.budget.remaining())}`);
    return undefined;
  };
}

export function attachTurnGuard(agent: Agent, maxTurns: number): () => void {
  let turns = 0;
  return agent.subscribe((ev) => {
    if (ev.type === "turn_end") {
      turns++;
      if (turns >= maxTurns) agent.abort();
    }
  });
}

/**
 * Assembles the Praeco agent: GLM-5.2 + the toolbelt + the money guard + the
 * runaway backstop. toolExecution is "sequential" so money operations never
 * race. The system prompt gives the LLM agency over decisions while the guard
 * holds the money invariants.
 */
import { Agent } from "@earendil-works/pi-agent-core";
import type { Model } from "@earendil-works/pi-ai";
import type { StreamFn } from "../llm/model.js";
import type { RunContext } from "./context.js";
import { buildTools } from "./tools.js";
import { makeBeforeToolCall, attachTurnGuard } from "./guard.js";
import { MAX_TURNS, baseUnitsToUsd } from "../constants.js";

export function systemPrompt(ctx: RunContext): string {
  return [
    `You are Praeco, an autonomous general contractor for product launches on the CROO agent marketplace.`,
    `Your job: assemble a launch kit by hiring REAL specialist agents — one per required leg — and paying each in USDC.`,
    `Required legs: ${ctx.requiredLegs.join(", ")}.`,
    `Product: ${ctx.brief.product} — ${ctx.brief.oneLiner} (audience: ${ctx.brief.audience}; tone: ${ctx.brief.tone}).`,
    ``,
    `Budget: total $${baseUnitsToUsd(ctx.budget.remaining())}, per-leg cap $${baseUnitsToUsd(ctx.budget.legCap())}. ` +
      `You CANNOT exceed these — over-budget hires are blocked automatically.`,
    ``,
    `For EACH required leg, in order:`,
    `1. search_marketplace(leg, query): find candidates. Prefer specialists with a strong track record in Praeco's own QA (qualityScore), then high completionRate. ` +
      `Avoid 0-order stubs — they accept but may never deliver.`,
    `2. get_service_schema(serviceId): learn the exact required input fields.`,
    `3. hire_specialist(leg, serviceId, requirements): fill the schema from the brief, then hire. Returns an orderId.`,
    `4. qa_review(orderId): critique it. "accept" -> submit_asset(orderId). "redo" -> hire the SAME provider again ` +
      `with better requirements. "swap" -> hire a DIFFERENT provider for this leg.`,
    ``,
    `Do one leg at a time. When every required leg has a submitted asset, STOP — make no further tool calls and hire nothing extra.`,
    `Be decisive and frugal: one good, QA-passed hire per leg is the goal.`,
    `On a "swap" verdict, call search_marketplace again for that leg and hire a DIFFERENT provider — do not re-hire the same one.`,
    `If a leg stays blocked after repeated attempts (hire_blocked), stop trying it and finish with the legs you have — a partial kit is acceptable.`,
  ].join("\n");
}

export function createPraecoAgent(ctx: RunContext, deps: { model: Model<any>; streamFn: StreamFn }): Agent {
  const agent = new Agent({
    initialState: {
      systemPrompt: systemPrompt(ctx),
      model: deps.model,
      tools: buildTools(ctx),
    },
    streamFn: deps.streamFn as Agent["streamFn"],
    convertToLlm: (messages) =>
      messages.filter((m) => m.role === "user" || m.role === "assistant" || m.role === "toolResult"),
    beforeToolCall: makeBeforeToolCall(ctx),
    toolExecution: "sequential",
  });
  attachTurnGuard(agent, MAX_TURNS);
  return agent;
}

/**
 * GLM-5.2 art-director / critic pass. Judges one specialist deliverable against
 * the brief and returns accept / redo / swap. This is the curate+QA loop the
 * agent drives (novelty #3) — the agent calls it as a tool and acts on the
 * verdict (submit, re-hire same provider, or hire a different one).
 */
import { z } from "zod";
import type { Llm } from "../llm/llm.js";
import type { LaunchBrief, LegKind, Deliverable, QaVerdict } from "../types.js";
import { deliverableToText } from "./provenance.js";

export const qaVerdictSchema = z.object({
  action: z.enum(["accept", "redo", "swap"]),
  reason: z.string(),
  score: z.number().min(0).max(100).optional(),
});

export async function reviewDeliverable(
  llm: Llm,
  brief: LaunchBrief,
  leg: LegKind,
  deliverable: Deliverable,
): Promise<QaVerdict> {
  const content = deliverableToText(deliverable).slice(0, 6000);
  const prompt =
    `You are Praeco's art director doing QA on one specialist deliverable for a product launch.\n\n` +
    `PRODUCT BRIEF:\n` +
    `- product: ${brief.product}\n- audience: ${brief.audience}\n- tone: ${brief.tone}\n` +
    `- features: ${brief.features.join(", ")}\n- pitch: ${brief.oneLiner}\n\n` +
    `LEG BEING REVIEWED: ${leg}\n\n` +
    `DELIVERABLE CONTENT:\n${content || "(empty)"}\n\n` +
    `Judge whether this deliverable is on-brief, high quality, and usable as-is.\n` +
    `Respond with JSON: {"action":"accept"|"redo"|"swap","reason":string,"score":0-100}.\n` +
    `Use "accept" if usable, "redo" if the same provider should retry, "swap" if a different provider is needed.`;
  return llm.completeJson(prompt, qaVerdictSchema);
}

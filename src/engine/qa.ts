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
  // Review a generous slice — research reports run long, and an over-tight limit
  // makes QA see a mid-sentence cutoff and wrongly reject it as "truncated/
  // incomplete" (Phase-1 live finding). GLM-5.2 has ample context for this.
  const REVIEW_LIMIT = 32000;
  const full = deliverableToText(deliverable);
  const content = full.length > REVIEW_LIMIT
    ? full.slice(0, REVIEW_LIMIT) + "\n\n[deliverable truncated HERE for review display only — not the provider's cutoff; do not judge completeness by this point]"
    : full;
  const prompt =
    `You are Praeco's art director doing QA on one specialist deliverable for a product launch.\n\n` +
    `PRODUCT BRIEF:\n` +
    `- product: ${brief.product}\n- audience: ${brief.audience}\n- tone: ${brief.tone}\n` +
    `- features: ${brief.features.join(", ")}\n- pitch: ${brief.oneLiner}\n\n` +
    `LEG BEING REVIEWED: ${leg}\n\n` +
    `DELIVERABLE CONTENT:\n${content || "(empty)"}\n\n` +
    `Judge whether this deliverable is on-brief, high quality, and usable as-is for this leg.\n` +
    `Do NOT penalise content-type/format: an og_image deliverable provided as a URL or image description is fine — judge its quality and relevance, not its file type.\n` +
    `If the content ends with a "[deliverable truncated HERE for review display only ...]" marker, that is our review limit — judge the substance shown, do not flag it as incomplete.\n` +
    `Respond with JSON: {"action":"accept"|"redo"|"swap","reason":string,"score":0-100}.\n` +
    `Use "accept" if the deliverable is on-brief and high quality, "redo" if the same provider should retry for better quality, "swap" if a different provider is needed (e.g. wrong type of content for this leg).`;
  return llm.completeJson(prompt, qaVerdictSchema);
}

/**
 * GLM-5.2 art-director / critic pass. Judges one specialist deliverable against
 * the brief and returns accept / redo / swap. This is the curate+QA loop the
 * agent drives (novelty #3) — the agent calls it as a tool and acts on the
 * verdict (submit, re-hire same provider, or hire a different one).
 */
import { z } from "zod";
import type { Llm } from "../llm/llm.js";
import type { LaunchBrief, LegKind, Deliverable, QaVerdict } from "../types.js";
import { deliverableToText, extractImageRef } from "./provenance.js";
import { QA_ACCEPT_MIN_SCORE } from "../constants.js";

export const qaVerdictSchema = z.object({
  action: z.enum(["accept", "redo", "swap"]),
  reason: z.string(),
  score: z.number().min(0).max(100),
});

/** Words with at least one alphanumeric char, after stripping URLs — the "substantive inline content" signal. */
export const MIN_TEXT_WORDS = 20;
export const MIN_IMAGE_SPEC_WORDS = 15;

// Match an image extension only when it ends a URL PATH segment: [^\s?#]+ stops
// before any query/fragment, so a redemption link like `…/redeem?img=logo.png`
// (extension in the query) does NOT count as an image URL. The trailing lookahead
// lets the extension be followed by punctuation/end but not more path.
const IMAGE_URL_RE = /https?:\/\/[^\s?#]+\.(?:png|jpe?g|webp|gif|svg|avif)(?![\w/])/i;

function substantiveWordCount(text: string): number {
  // Strip URLs before counting prose. Bound the URL to non-quote/bracket chars so a
  // JSON-stringified schema deliverable (`{"url":"…","headline":"real copy"}`) loses
  // only the URL, not the adjacent key/value it would otherwise run into.
  const withoutUrls = text.replace(/https?:\/\/[^\s"'<>]+/gi, " ");
  return withoutUrls.split(/\s+/).filter((w) => /[a-z0-9]/i.test(w)).length;
}

/**
 * Deterministic pre-LLM QA gate for the §7 deliverable-FORMAT problem. On the
 * live marketplace, "Code" services return a redemption code + platform link
 * with zero inline content — unusable for a launch kit. We reject that shape
 * cheaply (no LLM spend) and steer the agent to a different provider (`swap`).
 * Returns a swap verdict when the deliverable has no substantive inline content
 * for its leg, else null (the LLM art-director pass runs as normal).
 */
export function formatGate(leg: LegKind, deliverable: Deliverable, text = deliverableToText(deliverable)): QaVerdict | null {
  const raw = text.trim();
  if (!raw) {
    return { action: "swap", reason: "deliverable is empty — no inline content for this leg; hire a provider that delivers inline content" };
  }
  if (leg === "og_image") {
    // An image can legitimately arrive as an image URL OR a substantive spec/description.
    // A bare platform/redemption link (not an image URL) with no spec is the failure mode.
    if (IMAGE_URL_RE.test(raw)) return null;
    if (!extractImageRef(deliverable).startsWith("hash:")) return null; // bare URL or schema url field (handles extensionless CDN links)
    if (substantiveWordCount(raw) >= MIN_IMAGE_SPEC_WORDS) return null;
    return { action: "swap", reason: "og_image deliverable has neither an image URL nor a substantive spec (looks like a redemption code/link) — swap to a provider that delivers an inline image or a detailed image spec" };
  }
  const words = substantiveWordCount(raw);
  if (words < MIN_TEXT_WORDS) {
    return { action: "swap", reason: `${leg} deliverable has only ${words} words of inline content (redemption-code/link format, not usable prose) — swap to a provider that delivers inline ${leg}` };
  }
  return null;
}

export async function reviewDeliverable(
  llm: Llm,
  brief: LaunchBrief,
  leg: LegKind,
  deliverable: Deliverable,
): Promise<QaVerdict> {
  const full = deliverableToText(deliverable);
  const gated = formatGate(leg, deliverable, full); // reuse the derived text — no second deliverableToText pass
  if (gated) return gated; // deterministic swap — do not spend an LLM call on a wrong-format deliverable
  // Review a generous slice — research reports run long, and an over-tight limit
  // makes QA see a mid-sentence cutoff and wrongly reject it as "truncated/
  // incomplete" (Phase-1 live finding). GLM-5.2 has ample context for this.
  const REVIEW_LIMIT = 32000;
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
    `The deliverable MUST contain the actual usable content inline. If it only provides a redemption code, an access link, or instructions to retrieve the content elsewhere (rather than the content itself), return "swap".\n` +
    `If the content ends with a "[deliverable truncated HERE for review display only ...]" marker, that is our review limit — judge the substance shown, do not flag it as incomplete.\n` +
    `Respond with JSON: {"action":"accept"|"redo"|"swap","reason":string,"score":0-100}.\n` +
    `Use "accept" if the deliverable is on-brief and high quality, "redo" if the same provider should retry for better quality, "swap" if a different provider is needed (e.g. wrong type of content for this leg).`;
  const verdict = await llm.completeJson(prompt, qaVerdictSchema);
  // The score is binding: an "accept" the model itself scores below the bar is
  // downgraded to a redo (bounded by MAX_PAID_ATTEMPTS_PER_LEG). formatGate swaps
  // return earlier and are unaffected.
  if (verdict.action === "accept" && (verdict.score ?? 0) < QA_ACCEPT_MIN_SCORE) {
    return { action: "redo", reason: `QA score ${verdict.score} below ${QA_ACCEPT_MIN_SCORE} — revise`, score: verdict.score };
  }
  return verdict;
}

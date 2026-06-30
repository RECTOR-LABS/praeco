/**
 * Composer: stitch verified specialist deliverables into the finished launch
 * kit and generate the derived assets (tweet thread, short pitch, PH/HN blurb,
 * README polish) with GLM-5.2. Missing legs degrade gracefully (§10) — the kit
 * is assembled from whatever passed QA.
 */
import { z } from "zod";
import type { Llm } from "../llm/llm.js";
import type { LaunchBrief, LaunchAsset, LaunchKit, LegKind } from "../types.js";
import { deliverableToText, extractImageRef } from "./provenance.js";

const composedSchema = z.object({
  tweetThread: z.array(z.string()),
  shortPitch: z.string(),
  phHnBlurb: z.string(),
  readmePolish: z.string(),
});

const find = (assets: LaunchAsset[], leg: LegKind) => assets.find((a) => a.leg === leg);

export async function composeKit(llm: Llm, brief: LaunchBrief, assets: LaunchAsset[]): Promise<LaunchKit> {
  const research = find(assets, "research");
  const landing = find(assets, "landing_copy");
  const image = find(assets, "og_image");

  const landingCopy = landing ? deliverableToText(landing.hire.deliverable) : "";
  const ogImageRef = image ? extractImageRef(image.hire.deliverable) : "";
  const researchText = research ? deliverableToText(research.hire.deliverable).slice(0, 4000) : "(no research leg)";

  const prompt =
    `You are Praeco's composer, assembling a launch kit for "${brief.product}".\n\n` +
    `BRIEF: audience=${brief.audience}; tone=${brief.tone}; features=${brief.features.join(", ")}; pitch=${brief.oneLiner}\n\n` +
    `RESEARCH (from a hired specialist):\n${researchText}\n\n` +
    `LANDING COPY (from a hired specialist):\n${landingCopy || "(none)"}\n\n` +
    `Generate launch assets as JSON: {"tweetThread":string[] (4-6 tweets, the first is the hook),` +
    `"shortPitch":string (<=140 chars),"phHnBlurb":string (a Product Hunt / Hacker News intro),` +
    `"readmePolish":string (a polished README intro section in markdown)}. Match the brief's tone.`;

  const composed = await llm.completeJson(prompt, composedSchema);

  return {
    landingCopy,
    ogImageRef,
    tweetThread: composed.tweetThread,
    shortPitch: composed.shortPitch,
    phHnBlurb: composed.phHnBlurb,
    readmePolish: composed.readmePolish,
    provenance: assets.map((a) => a.provenance),
  };
}

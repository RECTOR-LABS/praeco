/**
 * Reading deliverables and minting provenance cards. extractImageRef defends
 * against the (Phase-1-unknown) image-provider deliverable shape: it surfaces a
 * direct URL when one is present in the text or a url-ish schema field, and
 * otherwise records a verifiable content-hash reference.
 */
import type { Deliverable, HireResult, ProvenanceCard } from "../types.js";
import { baseUnitsToUsd } from "../constants.js";

export function deliverableToText(d: Deliverable): string {
  if (d.text && d.text.trim()) return d.text;
  if (d.schema !== undefined) return typeof d.schema === "string" ? d.schema : JSON.stringify(d.schema);
  return "";
}

const URL_FIELDS = ["imageUrl", "image_url", "url", "image", "ogImage", "og_image", "link", "src", "mediaUrl"];

const isUrl = (s: string): boolean => /^https?:\/\/\S+$/i.test(s.trim());

export function extractImageRef(d: Deliverable): string {
  if (d.text && isUrl(d.text)) return d.text.trim();
  if (d.schema && typeof d.schema === "object") {
    const obj = d.schema as Record<string, unknown>;
    // Case-insensitive key match, in URL_FIELDS priority order, so a provider that
    // returns the url under `imageURL`/`IMAGE_URL`/`src` still resolves to a usable
    // image ref (not a hash) — otherwise the composed kit gets a hash-only ogImageRef
    // and the QA format-gate wrongly swaps a valid image.
    const byLower = new Map(Object.entries(obj).map(([k, v]) => [k.toLowerCase(), v]));
    for (const f of URL_FIELDS) {
      const v = byLower.get(f.toLowerCase());
      if (typeof v === "string" && isUrl(v)) return v.trim();
    }
  }
  return `hash:${d.contentHash}`;
}

export function toProvenanceCard(hire: HireResult): ProvenanceCard {
  return {
    leg: hire.leg,
    agentId: hire.agentId,
    agentName: hire.agentName,
    amountUsd: baseUnitsToUsd(BigInt(hire.priceBaseUnits)),
    contentHash: hire.deliverable.contentHash,
    payTxHash: hire.payTxHash,
    basescanUrl: hire.basescanPayUrl,
  };
}

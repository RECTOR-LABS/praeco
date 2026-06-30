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

const URL_FIELDS = ["imageUrl", "image_url", "url", "image", "ogImage", "og_image", "link"];

const isUrl = (s: string): boolean => /^https?:\/\/\S+$/i.test(s.trim());

export function extractImageRef(d: Deliverable): string {
  if (d.text && isUrl(d.text)) return d.text.trim();
  if (d.schema && typeof d.schema === "object") {
    const obj = d.schema as Record<string, unknown>;
    for (const f of URL_FIELDS) {
      const v = obj[f];
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

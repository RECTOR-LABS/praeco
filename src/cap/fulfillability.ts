/**
 * Pre-accept fulfillability gate for the Door B seller path. Before Praeco
 * accepts (and the buyer pays for) a launch-kit order, verify every required
 * leg has a live specialist hireable WITHIN the per-leg cap, and that the
 * cheapest full kit fits the run budget. If not → reject-with-reason: never
 * accept + charge for a job we can't fully fulfill (the 2026-07-04 defect).
 *
 * Reuses the engine's own discoverForLeg with the SAME candidate limit, pins,
 * and self-exclusion, so the gate predicts what the engine can STAFF. It is a
 * necessary (not sufficient) check: the engine still hires by relevance and may
 * QA-redo, so a passing order can still partial-fail — that's graceful
 * degradation, bounded by the engine's own per-leg cap + run budget.
 */
import type { LegKind } from "../types.js";
import type { Config } from "../config.js";
import type { FetchFn } from "./wallet.js";
import { listServices, listAgents, discoverForLeg, type ServiceListing, type AgentRecord } from "./discovery.js";
import { loadReputation, scorerFrom } from "./reputation.js";
import { REQUIRED_LEGS, SEARCH_CANDIDATE_LIMIT, usdToBaseUnits, baseUnitsToUsd } from "../constants.js";

export interface LegAssessment {
  leg: LegKind;
  candidates: number;          // matched for the leg (pre-affordability), self excluded, pin honored
  affordable: number;          // subset priced <= leg cap
  cheapestBaseUnits?: string;  // cheapest affordable candidate (undefined if none)
  pinned?: string;             // the pinned serviceId for this leg, if any
  note?: string;               // specific reason when the leg is not fulfillable
}
export interface FulfillabilityAssessment {
  ok: boolean;
  reason?: string;
  perLeg: LegAssessment[];
}
export interface AssessOpts {
  legs?: LegKind[];
  preferredServiceIds: Partial<Record<LegKind, string>>;
  selfAgentId?: string;
  legCapBaseUnits: bigint;
  runBudgetBaseUnits: bigint;
  queries?: Partial<Record<LegKind, string>>;
  qualityScoreOf?: (agentId: string) => number;
}

/** Canonical per-leg query — approximates a real LLM search so an unpinned
 *  pre-check doesn't under-count via an empty query. Ignored when a leg is
 *  pinned (discoverForLeg short-circuits on the pin).
 *  INVARIANT: every word here must be a LEG_KEYWORDS entry for its leg.
 *  legRelevance adds a bonus for any query word found in a candidate's
 *  name/description, so a NON-keyword word (e.g. "social"/"preview") would let
 *  the gate match services the engine's own query never would → a false
 *  "fulfillable" verdict (gate/engine drift). Keep these keyword-only. */
export const DEFAULT_LEG_QUERIES: Record<LegKind, string> = {
  research: "market research competitive analysis report",
  landing_copy: "landing page marketing copy content",
  og_image: "og image banner visual graphic design",
};

/** Parse a USDC base-unit price string to bigint. Non-integer / junk → null
 *  (treated as unaffordable — never accidentally the "cheapest"). */
export function parseBaseUnits(p: string): bigint | null {
  const t = (p ?? "").trim();
  if (!/^\d+$/.test(t)) return null;
  try { return BigInt(t); } catch { return null; }
}

/** Pinned service ids absent from the live catalog (stale pins). */
export function findStalePins(
  services: ServiceListing[],
  preferred: Partial<Record<LegKind, string>>,
): Array<{ leg: LegKind; serviceId: string }> {
  const have = new Set(services.map((s) => s.serviceId));
  const out: Array<{ leg: LegKind; serviceId: string }> = [];
  for (const [leg, serviceId] of Object.entries(preferred)) {
    if (serviceId && !have.has(serviceId)) out.push({ leg: leg as LegKind, serviceId });
  }
  return out;
}

export function assessFulfillability(
  services: ServiceListing[],
  agentsById: Map<string, AgentRecord>,
  opts: AssessOpts,
): FulfillabilityAssessment {
  const legs = opts.legs ?? REQUIRED_LEGS;
  const queries = opts.queries ?? DEFAULT_LEG_QUERIES;
  const have = new Set(services.map((s) => s.serviceId));
  const cap = opts.legCapBaseUnits;
  const perLeg: LegAssessment[] = [];
  let cheapestSum = 0n;
  let allAffordable = true;

  for (const leg of legs) {
    const pinned = opts.preferredServiceIds[leg];
    // Same limit the engine's search_marketplace applies, so the gate never
    // counts an affordable candidate the engine would truncate out of view.
    const ranked = discoverForLeg(services, agentsById, leg, queries[leg] ?? "", {
      preferredServiceId: pinned,
      excludeAgentId: opts.selfAgentId,
      limit: SEARCH_CANDIDATE_LIMIT,
      qualityScoreOf: opts.qualityScoreOf,
    });
    // Reject 0-priced listings: "0" is discovery's missing-price sentinel
    // (`price ?? "0"`), not a genuinely free specialist — an unknown price is
    // not a confirmable-affordable one.
    const affordable = ranked
      .map((r) => parseBaseUnits(r.priceBaseUnits))
      .filter((b): b is bigint => b !== null && b > 0n && b <= cap);
    const cheapest = affordable.length ? affordable.reduce((a, b) => (b < a ? b : a)) : undefined;

    const a: LegAssessment = { leg, candidates: ranked.length, affordable: affordable.length, cheapestBaseUnits: cheapest?.toString(), pinned };
    if (affordable.length === 0) {
      allAffordable = false;
      if (pinned && !have.has(pinned)) a.note = `pinned service ${pinned} is offline (stale pin)`;
      else if (ranked.length === 0) a.note = `no live specialist matches this leg`;
      else a.note = `no candidate priced within the $${baseUnitsToUsd(cap)} leg cap`;
    } else {
      cheapestSum += cheapest!;
    }
    perLeg.push(a);
  }

  if (!allAffordable) {
    return { ok: false, reason: perLeg.filter((l) => l.note).map((l) => `${l.leg}: ${l.note}`).join("; "), perLeg };
  }
  if (cheapestSum > opts.runBudgetBaseUnits) {
    return { ok: false, reason: `cheapest full kit $${baseUnitsToUsd(cheapestSum)} exceeds the $${baseUnitsToUsd(opts.runBudgetBaseUnits)} run budget`, perLeg };
  }
  return { ok: true, perLeg };
}

/** Fetch the live catalogs and assess REQUIRED_LEGS with the app config's
 *  pins, self-exclusion, leg cap, and run budget. Read-only REST (no WS). */
export async function checkFulfillability(cfg: Config, fetchImpl: FetchFn): Promise<FulfillabilityAssessment> {
  const [services, agents] = await Promise.all([
    listServices(cfg.crooApiUrl, fetchImpl),
    listAgents(cfg.crooApiUrl, fetchImpl),
  ]);
  const reputation = await loadReputation();
  return assessFulfillability(services, new Map(agents.map((a) => [a.agentId, a])), {
    legs: REQUIRED_LEGS,
    preferredServiceIds: cfg.preferredServiceIds,
    selfAgentId: cfg.praecoAgentId,
    legCapBaseUnits: usdToBaseUnits(cfg.legCapUsdc),
    runBudgetBaseUnits: usdToBaseUnits(cfg.runBudgetUsdc),
    qualityScoreOf: scorerFrom(reputation),
  });
}

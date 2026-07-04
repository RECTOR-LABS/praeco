/**
 * Pre-accept fulfillability gate for the Door B seller path. Before Praeco
 * accepts (and the buyer pays for) a launch-kit order, verify every required
 * leg has a live specialist hireable WITHIN the per-leg cap, and that the
 * cheapest full kit fits the run budget. If not → reject-with-reason: never
 * accept + charge for a job we can't fully fulfill (the 2026-07-04 defect).
 *
 * Reuses the engine's own discoverForLeg so the gate faithfully predicts the
 * run — same discovery, same fail-closed pins, same self-exclusion.
 */
import type { LegKind } from "../types.js";
import type { Config } from "../config.js";
import type { FetchFn } from "./wallet.js";
import { listServices, listAgents, discoverForLeg, type ServiceListing, type AgentRecord } from "./discovery.js";
import { REQUIRED_LEGS, usdToBaseUnits, baseUnitsToUsd } from "../constants.js";

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
}

/** Canonical per-leg query — approximates a real LLM search so an unpinned
 *  pre-check doesn't under-count via an empty query. Ignored when a leg is
 *  pinned (discoverForLeg short-circuits on the pin). */
export const DEFAULT_LEG_QUERIES: Record<LegKind, string> = {
  research: "market research competitive analysis report",
  landing_copy: "landing page marketing copy content",
  og_image: "og image social preview banner design",
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
    const ranked = discoverForLeg(services, agentsById, leg, queries[leg] ?? "", {
      preferredServiceId: pinned,
      excludeAgentId: opts.selfAgentId,
    });
    const affordable = ranked
      .map((r) => parseBaseUnits(r.priceBaseUnits))
      .filter((b): b is bigint => b !== null && b <= cap);
    const cheapest = affordable.length ? affordable.reduce((a, b) => (b < a ? b : a)) : undefined;

    const a: LegAssessment = { leg, candidates: ranked.length, affordable: affordable.length, cheapestBaseUnits: cheapest?.toString(), pinned };
    if (affordable.length === 0) {
      allAffordable = false;
      if (pinned && !have.has(pinned)) a.note = `pinned service ${pinned} is offline (stale pin)`;
      else if (ranked.length === 0) a.note = `no live specialist matches this leg`;
      else a.note = `cheapest candidate exceeds the $${baseUnitsToUsd(cap)} leg cap`;
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
  return assessFulfillability(services, new Map(agents.map((a) => [a.agentId, a])), {
    legs: REQUIRED_LEGS,
    preferredServiceIds: cfg.preferredServiceIds,
    selfAgentId: cfg.praecoAgentId,
    legCapBaseUnits: usdToBaseUnits(cfg.legCapUsdc),
    runBudgetBaseUnits: usdToBaseUnits(cfg.runBudgetUsdc),
  });
}

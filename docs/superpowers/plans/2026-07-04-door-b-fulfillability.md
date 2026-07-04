# Door B Engine-Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Never let Praeco accept + charge a Door B order it cannot fully staff and afford — reject-with-reason before accept — while excluding self-hire and surfacing stale pins.

**Architecture:** A new pure module (`src/cap/fulfillability.ts`) reuses the engine's own `discoverForLeg` to assess, per required leg, whether a live specialist is hireable within the per-leg cap and whether the cheapest full kit fits the run budget. It's injected into `fulfillOrder` as an optional pre-accept gate (read-only REST, $0 on reject). `discoverForLeg` gains universal self-exclusion; `door-b-fulfill` wires the gate + a startup stale-pin warning.

**Tech Stack:** TypeScript (ESM, `.js` import specifiers), Vitest, `@croo-network/sdk`, tsx CLIs. Money in USDC base units as `bigint`.

## Global Constraints

- **Money-safety (verbatim, spec §8):** the gate is **read-only** public REST (no WS, no chain write) and runs **before** `acceptNegotiation`, so a rejection spends **$0**. Do not alter `assertFunded → accept → wait-paid → spend → deliver-with-retry`, the per-leg cap, run budget, idempotent `paidOrderIds`, commit-at-pay, or the **fail-closed pin contract**.
- **No pin-escape (spec N1):** a stale/absent pin must still yield `[]` (fail-closed). Never fall back to an unvetted provider.
- **Self-exclusion is universal (spec D5):** `discoverForLeg` drops the caller's own `agentId` before **both** the pinned and ranked branches.
- **LegKind** = `"research" | "landing_copy" | "og_image"`; `REQUIRED_LEGS` is in that order.
- **Prices** are USDC base-unit **integer** strings; parse to `bigint`; junk/decimal → treat as **unaffordable** (never "cheapest"). Defaults: leg cap `$0.60` = `600000`, run budget `$2.00` = `2000000`.
- **Every commit:** GPG-sign (`git commit -S`, key `BF47B9DC1FA320FA`) and **NO AI attribution** (no `Co-Authored-By`, no robot footer — write as a human dev). Run `pnpm test:run` + `pnpm typecheck` green **before** each commit. One logical unit per commit.

---

### Task 1: Self-exclusion in `discoverForLeg`

**Files:**
- Modify: `src/cap/discovery.ts:290-329` (`discoverForLeg`)
- Test: `src/cap/discovery.test.ts` (add to the `describe("discoverForLeg")` block at line 186)

**Interfaces:**
- Produces: `discoverForLeg(services, agentsById, leg, query, opts)` where `opts` now includes `excludeAgentId?: string`. When set, services whose `agentId === excludeAgentId` are removed before both the pinned and ranked branches (a pin at an excluded agent → `[]`).

- [ ] **Step 1: Write the failing tests** — append inside the existing `describe("discoverForLeg", () => { … })` block (uses that block's `services` + `agentsById` fixtures; `449c3ab5` owns both `pygm-*` services):

```ts
  it("excludes the caller's own agent from ranked candidates (no self-hire)", () => {
    const ranked = discoverForLeg(services, agentsById, "og_image", "og image generation", { excludeAgentId: "449c3ab5" });
    expect(ranked.map((r) => r.agentId)).not.toContain("449c3ab5"); // both pygm services gone
  });
  it("excludes own agent even when its service is pinned (fail-closed, never self-hire)", () => {
    const ranked = discoverForLeg(services, agentsById, "og_image", "og image", { preferredServiceId: "pygm-image", excludeAgentId: "449c3ab5" });
    expect(ranked).toEqual([]);
  });
  it("still honors a pin for a non-excluded agent when excludeAgentId is set", () => {
    const ranked = discoverForLeg(services, agentsById, "research", "market research", { preferredServiceId: "ops-seo", excludeAgentId: "449c3ab5" });
    expect(ranked.map((r) => r.serviceId)).toEqual(["ops-seo"]);
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm exec vitest run src/cap/discovery.test.ts`
Expected: the 3 new tests FAIL (own agent still present / pin still resolves) — `excludeAgentId` is ignored today.

- [ ] **Step 3: Implement self-exclusion** — in `src/cap/discovery.ts`, extend the `opts` type and filter a `pool` before both branches:

```ts
export function discoverForLeg(
  services: ServiceListing[],
  agentsById: Map<string, AgentRecord>,
  leg: LegKind,
  query: string,
  opts: { preferredServiceId?: string; limit?: number; excludeAgentId?: string } = {},
): RankedListing[] {
  const fuse = (s: ServiceListing, relevance: number): RankedListing => {
    const a = agentsById.get(s.agentId);
    const completionRate = a?.completionRate ?? 0;
    const completedOrders = a?.completedOrders ?? 0;
    return {
      ...s, agentName: a?.name ?? "", completedOrders, completionRate,
      onlineStatus: a?.onlineStatus, skillTagSlugs: a?.skillTagSlugs ?? [],
      relevance, repScore: completionRate * Math.log10(completedOrders + 1),
      formatDeRank: isCodeFormat(s.name, s.description ?? "") ? 1 : 0,
    };
  };
  // Self-exclusion: never offer the caller's own services as candidates (no
  // self-hire). Applied before BOTH branches, so a pin pointing at an own
  // service also fails closed rather than hiring itself.
  const pool = opts.excludeAgentId ? services.filter((s) => s.agentId !== opts.excludeAgentId) : services;
  if (opts.preferredServiceId) {
    const pinned = pool.find((s) => s.serviceId === opts.preferredServiceId);
    return pinned ? [fuse(pinned, 999)] : [];
  }
  const ranked: RankedListing[] = pool.map((s) =>
    fuse(s, legRelevance(s.name, s.description ?? "", agentsById.get(s.agentId)?.skillTagSlugs ?? [], leg, query)),
  );
  const matches = ranked.filter((r) => r.relevance > 0);
  matches.sort((a, b) => {
    if (a.formatDeRank !== b.formatDeRank) return a.formatDeRank - b.formatDeRank;
    if (b.relevance !== a.relevance) return b.relevance - a.relevance;
    if (b.repScore !== a.repScore) return b.repScore - a.repScore;
    return priceOf(a.priceBaseUnits) - priceOf(b.priceBaseUnits);
  });
  return opts.limit ? matches.slice(0, opts.limit) : matches;
}
```

(This replaces the current body from the `fuse` definition through the `return`. The only changes vs. today: `excludeAgentId?` in the opts type, and `services` → `pool` in the two branches. Keep the surrounding doc comment.)

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm exec vitest run src/cap/discovery.test.ts`
Expected: PASS (all existing + 3 new).

- [ ] **Step 5: Commit**

```bash
git add src/cap/discovery.ts src/cap/discovery.test.ts
git commit -S -m "feat(discovery): self-exclusion — never offer own agent as a candidate

discoverForLeg gains excludeAgentId, applied before both the pinned and
ranked branches so Praeco can never hire itself (a pin at an own service
fails closed). Keeps the fail-closed pin contract intact."
```

---

### Task 2: Thread `selfAgentId` through the engine

**Files:**
- Modify: `src/engine/context.ts:15-21` (`RunConfig`)
- Modify: `src/engine/run.ts:72-78` (`ctx.config` literal)
- Modify: `src/engine/tools.ts:49-52` (`discoverForLeg` call)
- Test: `src/engine/tools.test.ts` (add to `describe("search_marketplace tool")` at line 85)

**Interfaces:**
- Consumes: `discoverForLeg(..., { excludeAgentId })` from Task 1; `Config.praecoAgentId` (already loaded in `src/config.ts`).
- Produces: `RunConfig.selfAgentId?: string`, populated from `deps.config.praecoAgentId` in `runLaunchJob`, consumed by `search_marketplace`.

- [ ] **Step 1: Write the failing test** — append inside `describe("search_marketplace tool", () => { … })` (reuses `catalogFetch`, whose `pygm` agent owns `pygm-text`/`pygm-image`):

```ts
  it("excludes Praeco's own agent from discovered candidates (no self-hire)", async () => {
    const ctx = ctxFor(happyClient(), fakeLlm({}));
    ctx.candidates.clear();
    ctx.fetchImpl = catalogFetch();
    ctx.config = { ...ctx.config, selfAgentId: "pygm" }; // pretend Praeco IS pygm
    const res = await toolMap(ctx).search_marketplace.execute("id", { leg: "og_image", query: "og image" });
    const ids = ((res.details as any).candidates ?? []) as string[];
    expect(ids).not.toContain("pygm-image"); // own image service excluded (it was [0] without exclusion)
    expect(ids).not.toContain("pygm-text");
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run src/engine/tools.test.ts`
Expected: FAIL — `pygm-image` still returned (`selfAgentId` not threaded into `discoverForLeg` yet). Vitest transpiles without type-checking, so the not-yet-declared `selfAgentId` on `ctx.config` runs fine at runtime; the assertion is what fails.

- [ ] **Step 3: Thread the field** — three edits:

`src/engine/context.ts` — add `selfAgentId` to `RunConfig`:

```ts
export interface RunConfig {
  apiUrl: string;
  rpcUrl: string;
  agentWallet: string;
  usdcTokenAddress: string;
  preferredServiceIds: Partial<Record<LegKind, string>>;
  selfAgentId?: string; // Praeco's own agentId — excluded from discovery (no self-hire)
}
```

`src/engine/run.ts` — populate it in the `ctx.config` literal (inside `runLaunchJob`):

```ts
    config: {
      apiUrl: deps.config.crooApiUrl,
      rpcUrl: deps.config.baseRpcUrl,
      agentWallet: deps.config.praecoAgentWallet,
      usdcTokenAddress: deps.config.usdcTokenAddress,
      preferredServiceIds: deps.config.preferredServiceIds,
      selfAgentId: deps.config.praecoAgentId,
    },
```

`src/engine/tools.ts` — pass it into the `discoverForLeg` call inside `search_marketplace.execute`:

```ts
      const top = discoverForLeg(ctx.catalog, ctx.agentsById, leg, query, {
        preferredServiceId: ctx.config.preferredServiceIds[leg],
        excludeAgentId: ctx.config.selfAgentId,
        limit: 5,
      });
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm exec vitest run src/engine/tools.test.ts src/engine/run.test.ts`
Expected: PASS (new exclusion test + all existing engine tests).

- [ ] **Step 5: Verify self-exclusion is a no-op for the sandbox market**

Run: `pnpm engine:smoke`
Expected: the engine discovers + hires `mock-research`/`mock-copy`/`mock-image` exactly as before (self-exclusion filters nothing — `ma1/ma2/ma3` ≠ the configured `PRAECO_AGENT_ID`). Final status is `COMPLETED` (3/3, $0.70) **or** `partial` (2/3, ~$0.80): the landing_copy QA verdict on the fixed mock deliverable is GLM-nondeterministic and can hit the paid-attempt cap — a **pre-existing** clean-kit behavior, not caused by this change. The invariant that must hold: no discovery regression (mock-copy still found + hired).

- [ ] **Step 6: Commit**

```bash
git add src/engine/context.ts src/engine/run.ts src/engine/tools.ts src/engine/tools.test.ts
git commit -S -m "feat(engine): exclude Praeco's own agent from live discovery

Thread praecoAgentId → RunConfig.selfAgentId → search_marketplace so the
engine never self-hires now that Praeco has its own broad service. No-op
for the sandbox market; engine:smoke stays 3/3."
```

---

### Task 3: `src/cap/fulfillability.ts` — assess + stale-pins + wrapper

**Files:**
- Create: `src/cap/fulfillability.ts`
- Test: `src/cap/fulfillability.test.ts`

**Interfaces:**
- Consumes: `discoverForLeg` (+ `excludeAgentId`, Task 1); `listServices`/`listAgents`/`ServiceListing`/`AgentRecord` from `./discovery.js`; `REQUIRED_LEGS`/`usdToBaseUnits`/`baseUnitsToUsd` from `../constants.js`; `Config` from `../config.js`; `FetchFn` from `./wallet.js`.
- Produces:
  - `parseBaseUnits(p: string): bigint | null`
  - `DEFAULT_LEG_QUERIES: Record<LegKind, string>`
  - `findStalePins(services, preferred): Array<{ leg: LegKind; serviceId: string }>`
  - `assessFulfillability(services, agentsById, opts): FulfillabilityAssessment`
  - `checkFulfillability(cfg: Config, fetchImpl: FetchFn): Promise<FulfillabilityAssessment>`
  - Types `LegAssessment`, `FulfillabilityAssessment`, `AssessOpts` (fields per spec §5).

- [ ] **Step 1: Write the failing tests** — create `src/cap/fulfillability.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { assessFulfillability, findStalePins, parseBaseUnits } from "./fulfillability.js";
import type { ServiceListing, AgentRecord } from "./discovery.js";

const agent = (agentId: string): AgentRecord =>
  ({ agentId, name: agentId, completedOrders: 100, completionRate: 1, skillTagSlugs: [], services: [] });

// A catalog that fully staffs all three legs, each affordably (<= $0.60 cap).
const fullServices: ServiceListing[] = [
  { serviceId: "r1", agentId: "ar", name: "Verifiable Research Report", description: "market research competitive analysis", priceBaseUnits: "100000" },
  { serviceId: "c1", agentId: "ac", name: "Landing Page Copy", description: "landing page copywriting and content", priceBaseUnits: "100000" }, // NB: avoid "marketing" — its "market" substring would score as a research hit
  { serviceId: "i1", agentId: "ai", name: "OG Image Generator", description: "og image social preview design", priceBaseUnits: "500000" },
];
const fullAgents = new Map<string, AgentRecord>([["ar", agent("ar")], ["ac", agent("ac")], ["ai", agent("ai")]]);
const base = { preferredServiceIds: {}, legCapBaseUnits: 600000n, runBudgetBaseUnits: 2000000n };

describe("parseBaseUnits", () => {
  it("parses integer strings, rejects junk/decimals as null", () => {
    expect(parseBaseUnits("100000")).toBe(100000n);
    expect(parseBaseUnits(" 200000 ")).toBe(200000n);
    expect(parseBaseUnits("")).toBeNull();
    expect(parseBaseUnits("abc")).toBeNull();
    expect(parseBaseUnits("1.5")).toBeNull();
  });
});

describe("assessFulfillability", () => {
  it("ok when every leg has an affordable candidate and the kit fits the budget", () => {
    const r = assessFulfillability(fullServices, fullAgents, base);
    expect(r.ok).toBe(true);
    expect(r.perLeg.map((l) => l.affordable)).toEqual([1, 1, 1]);
  });
  it("rejects when a required leg has zero matching candidates", () => {
    const r = assessFulfillability(fullServices.filter((s) => s.serviceId !== "c1"), fullAgents, base);
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/landing_copy: no live specialist/);
  });
  it("rejects with a stale-pin reason when a pinned service is absent", () => {
    const r = assessFulfillability(fullServices, fullAgents, { ...base, preferredServiceIds: { research: "gone-123" } });
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/research: pinned service gone-123 is offline \(stale pin\)/);
  });
  it("rejects when a leg's only candidate exceeds the leg cap", () => {
    const svcs = fullServices.map((s) => (s.serviceId === "i1" ? { ...s, priceBaseUnits: "700000" } : s));
    const r = assessFulfillability(svcs, fullAgents, base);
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/og_image: cheapest candidate exceeds the \$0.60 leg cap/);
  });
  it("rejects when the cheapest full kit exceeds the run budget", () => {
    const svcs = fullServices.map((s) => ({ ...s, priceBaseUnits: "500000" })); // each $0.50 <= cap
    const r = assessFulfillability(svcs, fullAgents, { ...base, runBudgetBaseUnits: 1000000n }); // $1.00 budget
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/cheapest full kit \$1.50 exceeds the \$1.00 run budget/);
  });
  it("excludes the caller's own agent — a leg served only by self is unfulfillable", () => {
    const r = assessFulfillability(fullServices, fullAgents, { ...base, selfAgentId: "ai" });
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/og_image: no live specialist/);
  });
});

describe("findStalePins", () => {
  it("flags pinned ids absent from the catalog, ignores present + unset", () => {
    const stale = findStalePins(fullServices, { research: "r1", landing_copy: "gone" });
    expect(stale).toEqual([{ leg: "landing_copy", serviceId: "gone" }]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm exec vitest run src/cap/fulfillability.test.ts`
Expected: FAIL — `Cannot find module './fulfillability.js'`.

- [ ] **Step 3: Implement the module** — create `src/cap/fulfillability.ts`:

```ts
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
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm exec vitest run src/cap/fulfillability.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add src/cap/fulfillability.ts src/cap/fulfillability.test.ts
git commit -S -m "feat(cap): fulfillability assessment — staffable + affordable per leg

Pure assessFulfillability reuses discoverForLeg to check every required
leg has a candidate within the leg cap and the cheapest full kit fits the
run budget; findStalePins flags pinned ids absent from the catalog;
checkFulfillability wraps the live catalog fetch. All bigint money math."
```

---

### Task 4: `checkFulfillable` gate in `fulfillOrder`

**Files:**
- Modify: `server/fulfill-order.ts` (imports, `FulfillDeps`, insert gate after the invalid-brief block ~line 45, before `assertFunded` ~line 47)
- Test: `server/fulfill-order.test.ts` (add cases)

**Interfaces:**
- Consumes: `FulfillabilityAssessment` from `@/src/cap/fulfillability` (Task 3).
- Produces: `FulfillDeps.checkFulfillable?: () => Promise<FulfillabilityAssessment>`. When present and `!ok`, `fulfillOrder` rejects the negotiation and returns `{ status: "rejected", reason }` **without** accepting. When absent, behavior is unchanged (back-compat).

- [ ] **Step 1: Write the failing tests** — append to `describe("fulfillOrder", () => { … })` in `server/fulfill-order.test.ts` (`mockProvider`'s negotiationId is `"mock-neg"`):

```ts
  it("rejects (never accepts) when the fulfillability check fails", async () => {
    const provider = mockProvider({ paysAfter: 0 });
    const acceptSpy = vi.spyOn(provider, "acceptNegotiation");
    const rejectSpy = vi.spyOn(provider, "rejectNegotiation");
    const runJob = vi.fn(async () => rec());
    const checkFulfillable = async () => ({ ok: false, reason: "landing_copy: no live specialist matches this leg", perLeg: [] });
    const out = await fulfillOrder({ provider, runJob, checkFulfillable, poll: noSleep });
    expect(acceptSpy).not.toHaveBeenCalled();
    expect(runJob).not.toHaveBeenCalled();
    expect(rejectSpy).toHaveBeenCalledWith("mock-neg", expect.stringMatching(/cannot fulfill: landing_copy/));
    expect(out.status).toBe("rejected");
  });
  it("proceeds to accept + deliver when the fulfillability check passes", async () => {
    const provider = mockProvider({ brief: "a habit tracker", paysAfter: 0 });
    const acceptSpy = vi.spyOn(provider, "acceptNegotiation");
    const checkFulfillable = async () => ({ ok: true, perLeg: [{ leg: "research" as const, candidates: 1, affordable: 1 }] });
    const out = await fulfillOrder({ provider, runJob: async () => rec(), checkFulfillable, poll: noSleep });
    expect(acceptSpy).toHaveBeenCalled();
    expect(out.status).toBe("delivered");
  });
  it("skips the gate entirely when no checker is provided (back-compat)", async () => {
    const provider = mockProvider({ paysAfter: 0 });
    const out = await fulfillOrder({ provider, runJob: async () => rec(), poll: noSleep });
    expect(out.status).toBe("delivered");
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm exec vitest run server/fulfill-order.test.ts`
Expected: the "rejects … fulfillability check fails" test FAILS (order is accepted today; `checkFulfillable` is ignored). The other two pass incidentally but the reject test pins the new behavior.

- [ ] **Step 3: Implement the gate** — in `server/fulfill-order.ts`:

Add the type import near the top (with the other `import type` lines):

```ts
import type { FulfillabilityAssessment } from "@/src/cap/fulfillability";
```

Add the optional dep to `FulfillDeps` (after `deliver?`):

```ts
  checkFulfillable?: () => Promise<FulfillabilityAssessment>;
```

Insert the gate between the invalid-brief `if (!input) { … }` block and `if (deps.assertFunded) …`:

```ts
  // Fulfillability gate: never accept + charge for a kit we can't fully staff
  // and afford. Read-only REST, runs before accept → a rejection costs $0.
  if (deps.checkFulfillable) {
    const f = await deps.checkFulfillable();
    if (!f.ok) {
      const reason = `cannot fulfill: ${f.reason ?? "required legs unavailable"}`;
      await deps.provider.rejectNegotiation(n.negotiationId, reason);
      log(`rejected ${n.negotiationId}: ${reason}`);
      return { status: "rejected", reason };
    }
    log(`fulfillable: ${f.perLeg.map((l) => `${l.leg}=${l.affordable}`).join(" ")}`);
  }
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm exec vitest run server/fulfill-order.test.ts`
Expected: PASS (existing 11 + 3 new).

- [ ] **Step 5: Commit**

```bash
git add server/fulfill-order.ts server/fulfill-order.test.ts
git commit -S -m "feat(door-b): reject unfulfillable orders before accepting

fulfillOrder gains an optional checkFulfillable gate that runs after the
brief parse and before assertFunded/accept: on !ok it rejects the
negotiation with the specific reason and returns without accepting — so
Praeco never charges for a kit it can't staff + afford. Absent → unchanged."
```

---

### Task 5: Wire the CLI + startup stale-pin warning

**Files:**
- Modify: `scripts/door-b-fulfill.ts` (imports + both `main()` branches)

**Interfaces:**
- Consumes: `checkFulfillability`/`findStalePins` (Task 3), the `checkFulfillable` dep (Task 4), `listServices` (`src/cap/discovery.js`), `mockFetch` (`src/cap/mock.js`).
- Produces: the real path wires `checkFulfillable = () => checkFulfillability(cfg, fetch)` + logs stale pins once at startup; `--sim` wires the gate over the mock catalog with pins cleared.

- [ ] **Step 1: Add imports** — in `scripts/door-b-fulfill.ts`, alongside the existing imports:

```ts
import { listServices } from "../src/cap/discovery.js";
import { checkFulfillability, findStalePins } from "../src/cap/fulfillability.js";
import { mockFetch } from "../src/cap/mock.js";
```

- [ ] **Step 2: Wire the sim path** — replace the `if (sim) { … }` block in `main()` with (clears pins + mock catalog, mirroring `buildSandboxDeps`, spec §12):

```ts
  if (sim) {
    const cfg = loadConfig();
    const mfetch = mockFetch();
    const checkFulfillable = () => checkFulfillability({ ...cfg, preferredServiceIds: {} }, mfetch);
    return runLoop(() => {
      const provider = mockProvider({ brief: "A privacy-first habit tracker for indie developers" });
      const runJob = (input: IntakeInput) => runLaunchJob(input, buildSandboxDeps(() => {}, `live-${Date.now()}`));
      return fulfillOrder({ provider, runJob, checkFulfillable, poll: { attempts: 10, delayMs: 200 }, onLog: log });
    });
  }
```

- [ ] **Step 3: Wire the real path** — replace the real-path body of `main()` (the `const cfg = loadConfig();` through the `finally`) with (adds the startup warning + the gate):

```ts
  // Real path: construct the client + WS exactly once, not per fulfill attempt —
  // reused for every --watch iteration (or the single one-shot call).
  const cfg = loadConfig();
  const client = new AgentClient({ baseURL: cfg.crooApiUrl, wsURL: cfg.crooWsUrl, rpcURL: cfg.baseRpcUrl }, cfg.crooSdkKey);
  const stream = await client.connectWebSocket(); // presence; providers won't transact with an offline agent
  try {
    // Pin hygiene: warn once on any pinned SVC_* absent from the live catalog
    // (fail-closed still protects money — this is visibility, not enforcement).
    for (const { leg, serviceId } of findStalePins(await listServices(cfg.crooApiUrl, fetch as never), cfg.preferredServiceIds)) {
      log(`WARNING: pinned ${leg} service ${serviceId} is not in the live catalog (stale pin — that leg is unfulfillable until refreshed)`);
    }
    const provider = new AgentClientProvider(client as never);
    const runJob = (input: IntakeInput) =>
      runLaunchJob(input, buildLiveDepsWith(client, () => {}, `live-${Date.now()}`)); // shared client — one WS
    const assertFundedFn = () => assertFunded(cfg.baseRpcUrl, cfg.praecoAgentWallet, cfg.usdcTokenAddress, 1n, fetch as never);
    const checkFulfillable = () => checkFulfillability(cfg, fetch as never);
    await runLoop(() => fulfillOrder({ provider, runJob, assertFunded: assertFundedFn, checkFulfillable, onLog: log }));
  } finally {
    stream.close?.(); // EventStream's close — AgentClient itself has no close()
  }
```

- [ ] **Step 4: Typecheck**

Run: `pnpm typecheck`
Expected: no errors.

- [ ] **Step 5: Verify the sim end-to-end (gate logs, then delivers, $0 offline)**

Run: `pnpm door-b:sim`
Expected: logs `[door-b] fulfillable: research=1 landing_copy=1 og_image=1`, the engine runs (real GLM sandbox, ~1–2 min, $0 real), then `[door-b] result: {"status":"delivered",…}`. The process exits 0.

- [ ] **Step 6: Commit**

```bash
git add scripts/door-b-fulfill.ts
git commit -S -m "feat(door-b): wire fulfillability gate + startup stale-pin warning

Real path checks fulfillability before accepting and warns on stale SVC_*
pins at startup; --sim runs the gate over the mock catalog with pins
cleared so the \$0 offline proof now covers the gate too."
```

---

### Task 6: Full-suite verification

**Files:** none (verification only).

- [ ] **Step 1: Full test suite**

Run: `pnpm test:run`
Expected: all green (183 prior + the new discovery/tools/fulfillability/fulfill-order tests).

- [ ] **Step 2: Typecheck + build**

Run: `pnpm typecheck && pnpm exec next build`
Expected: no type errors; Next build succeeds.

- [ ] **Step 3: Sandbox engine proof (no discovery regression)**

Run: `pnpm engine:smoke`
Expected: the engine discovers/hires/composes; final `COMPLETED` (3/3, $0.70) **or** `partial` (2/3, ~$0.80) depending on the GLM's landing_copy QA verdict (pre-existing nondeterminism — the paid-attempt cap bounds it). The invariant is graceful composition with no discovery break, not a hard 3/3.

- [ ] **Step 4 (optional $0 live probe — read-only, no accept, no spend):** confirm the gate would reject today's stale pins instead of delivering an empty kit. With the current (stale) `SVC_*` in `.env`, start `pnpm door-b:fulfill` (no order pending) and observe the startup `WARNING: pinned … stale pin` lines for the offline research/landing_copy pins. Ctrl-C. (This reproduces the 2026-07-04 failure as a visible warning + would-be rejection, with zero on-chain action.)

---

## Post-plan (gated on RECTOR — NOT part of this code cycle)

- Refresh `SVC_*` values in `.env` to online specialists (research→ZERU `e8998099…`, og_image→Pygm `4dab1a29…`, landing_copy→decide with RECTOR — under-served). Operational, secret file, not committed (spec N2).
- With RECTOR's explicit go + specialists confirmed online: one clean live 3/3 (`pnpm engine:run` or a full `pnpm door-b:fulfill --watch` order) → capture into `docs/door-b-onchain-proof.md`.
- Then: demo video, BUIDL filing, restore stronger Door B wording, ≥5 buyer wallets (each its own session).

# Praeco Integrity Hardening — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close five audit-surfaced integrity gaps: charge only for deliverable kits, reject out-of-scope intake, make the QA score binding, base reputation on our own QA (not marketplace popularity), and publish an honest judge-facing Q&A.

**Architecture:** Small, surgical changes to the existing engine. New pure module `src/cap/reputation.ts` (a persisted per-agent QA ledger with a Bayesian score) threads a `qualityScoreOf` scorer into the existing `discoverForLeg` ranking and the fulfillability gate; the run captures QA outcomes and persists them at run end. The other four fixes are localized edits to `qa.ts`, `fulfill-order.ts`, `intake.ts`, and a doc.

**Tech Stack:** TypeScript, Vitest, Zod, Next.js 15 (App Router), `@croo-network/sdk`, `@earendil-works/pi-*`.

## Global Constraints

- 2-space indent; comments only for non-obvious logic; match surrounding style.
- Tests: Vitest. Run `pnpm test:run` (full suite) + `pnpm typecheck` green before every commit. Do NOT weaken existing tests to pass — update them only where behavior legitimately changed.
- Money guard is untouched: `DEFAULT_RUN_BUDGET_USDC = "2.00"`, `DEFAULT_LEG_CAP_USDC = "0.60"`, `MAX_PAID_ATTEMPTS_PER_LEG = 2` stay as-is. Pins / self-exclusion / fail-closed contract in `discoverForLeg` unchanged.
- No AI attribution in commits. GPG-sign every commit (`git commit -S`). One task = one commit.
- All work is `$0` (mock/unit tests). The only money-gated step is the on-chain confirmation that CAP returns the buyer's escrow on `rejectOrder` after payment (Task 2) — out of scope for this plan; code + sim tests land here.
- New constants: `MIN_DELIVERABLE_LEGS = 2`, `QA_ACCEPT_MIN_SCORE = 70`.
- Reputation store path: `process.env.REPUTATION_FILE ?? join(process.env.RUNS_DIR ?? "./runs", "reputation.json")`. Best-effort I/O (swallow errors — Vercel FS is read-only).

---

## Task 1: QA score becomes binding (Fix 3)

**Files:**
- Modify: `src/constants.ts` (add `QA_ACCEPT_MIN_SCORE`)
- Modify: `src/engine/qa.ts` (`qaVerdictSchema` score required; downgrade accept-below-threshold to redo)
- Test: `src/engine/qa.test.ts`

**Interfaces:**
- Produces: `QA_ACCEPT_MIN_SCORE: number` (=70); `reviewDeliverable` unchanged signature `(llm, brief, leg, deliverable) => Promise<QaVerdict>`, new behavior: an LLM `accept` with `score < 70` returns `{ action: "redo", … }`.

- [ ] **Step 1: Write the failing tests**

Add to `src/engine/qa.test.ts` inside `describe("reviewDeliverable", …)`:

```ts
it("downgrades an accept with a sub-threshold score to redo", async () => {
  const llm = fakeLlm({ action: "accept", reason: "meh but ok", score: 65 });
  const verdict = await reviewDeliverable(llm, brief, "landing_copy", textDeliverable(SUBSTANTIVE));
  expect(verdict.action).toBe("redo");
  expect(verdict.score).toBe(65);
  expect(verdict.reason).toMatch(/70/);
});

it("keeps an accept at or above the threshold", async () => {
  const llm = fakeLlm({ action: "accept", reason: "on-brief", score: 70 });
  const verdict = await reviewDeliverable(llm, brief, "research", textDeliverable(SUBSTANTIVE));
  expect(verdict.action).toBe("accept");
});

it("requires a score in the verdict schema", () => {
  expect(() => qaVerdictSchema.parse({ action: "accept", reason: "x" })).toThrow();
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test:run src/engine/qa.test.ts`
Expected: FAIL — the downgrade test sees `action: "accept"`; the schema test does not throw (score is currently `.optional()`).

- [ ] **Step 3: Add the constant**

In `src/constants.ts`, after `MAX_PAID_ATTEMPTS_PER_LEG`:

```ts
/** Minimum QA score (0-100) required to accept a deliverable. An LLM "accept"
 *  below this is downgraded to a redo — the score is binding, not decorative. */
export const QA_ACCEPT_MIN_SCORE = 70;
```

- [ ] **Step 4: Make the schema strict and apply the threshold**

In `src/engine/qa.ts`: change the schema (`score` required) and the import, and wrap the verdict.

```ts
// import line — add QA_ACCEPT_MIN_SCORE
import { QA_ACCEPT_MIN_SCORE } from "../constants.js";

export const qaVerdictSchema = z.object({
  action: z.enum(["accept", "redo", "swap"]),
  reason: z.string(),
  score: z.number().min(0).max(100),
});
```

Replace the final line of `reviewDeliverable` (`return llm.completeJson(prompt, qaVerdictSchema);`) with:

```ts
  const verdict = await llm.completeJson(prompt, qaVerdictSchema);
  // The score is binding: an "accept" the model itself scores below the bar is
  // downgraded to a redo (bounded by MAX_PAID_ATTEMPTS_PER_LEG). formatGate swaps
  // return earlier and are unaffected.
  if (verdict.action === "accept" && (verdict.score ?? 0) < QA_ACCEPT_MIN_SCORE) {
    return { action: "redo", reason: `QA score ${verdict.score} below ${QA_ACCEPT_MIN_SCORE} — revise`, score: verdict.score };
  }
  return verdict;
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm test:run src/engine/qa.test.ts`
Expected: PASS. Then `pnpm test:run && pnpm typecheck` — full suite green (the existing run.test.ts art-director returns score 88 → still accept).

- [ ] **Step 6: Commit**

```bash
git add src/constants.ts src/engine/qa.ts src/engine/qa.test.ts
git commit -S -m "feat(qa): make the QA score binding (accept requires score >= 70)"
```

---

## Task 2: Door B rejects under-delivered orders (Fix 1)

**Files:**
- Modify: `src/constants.ts` (add `MIN_DELIVERABLE_LEGS`)
- Modify: `server/fulfill-order.ts` (reject when `rec.assets.length < MIN_DELIVERABLE_LEGS`)
- Test: `server/fulfill-order.test.ts`

**Interfaces:**
- Consumes: `RunRecord.assets: LaunchAsset[]`, `provider.rejectOrder(orderId, reason)`.
- Produces: `fulfillOrder` returns `{ status: "rejected", orderId, reason }` when the run delivered fewer than 2 of 3 legs.

- [ ] **Step 1: Update the `rec` test helper and rewrite the boundary test**

In `server/fulfill-order.test.ts`, replace the `rec` helper (lines ~6-10) so it takes an explicit asset count and defaults to a full kit (so existing "delivers" tests still deliver):

```ts
const rec = (status = "completed", nAssets = 3) => ({
  runId: "run-x", status, brief: { product: "P", audience: "a", features: [], tone: "t", oneLiner: "o" },
  assets: Array.from({ length: nAssets }, () => ({})), spentBaseUnits: "700000", startedAt: 1, endedAt: 2, worklog: [],
  kit: nAssets > 0 ? { landingCopy: "c", ogImageRef: "hash:0x", tweetThread: ["t"], shortPitch: "s", phHnBlurb: "p", readmePolish: "r", provenance: [] } : undefined,
}) as never;
```

Replace the existing test "still delivers a partial run with a note" (lines ~45-50) with these:

```ts
it("rejects (does NOT charge) a run that delivered 0 legs", async () => {
  const provider = mockProvider({ paysAfter: 0 });
  const rejectSpy = vi.spyOn(provider, "rejectOrder");
  const deliverSpy = vi.spyOn(provider, "deliverOrder");
  const out = await fulfillOrder({ provider, runJob: async () => rec("failed", 0), poll: noSleep });
  expect(out.status).toBe("rejected");
  expect(rejectSpy).toHaveBeenCalledWith("mock-order", expect.stringMatching(/0 of 3 legs/));
  expect(deliverSpy).not.toHaveBeenCalled();
});

it("rejects a 1-of-3-leg run (below the 2-leg minimum)", async () => {
  const provider = mockProvider({ paysAfter: 0 });
  const out = await fulfillOrder({ provider, runJob: async () => rec("partial", 1), poll: noSleep });
  expect(out.status).toBe("rejected");
});

it("delivers a genuine 2-of-3-leg partial kit", async () => {
  const provider = mockProvider({ paysAfter: 0 });
  const out = await fulfillOrder({ provider, runJob: async () => rec("partial", 2), poll: noSleep });
  expect(out.status).toBe("delivered");
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test:run server/fulfill-order.test.ts`
Expected: FAIL — the 0-leg and 1-leg runs currently return `delivered`, not `rejected`.

- [ ] **Step 3: Add the constant**

In `src/constants.ts`:

```ts
/** Minimum QA-accepted legs a Door B order must produce to deliver + charge.
 *  Below this (0 or 1 of 3), reject the order — never charge for a kit that
 *  under-delivers. Makes "never charges for a kit it can't deliver" true
 *  post-acceptance, not just pre-accept (the fulfillability gate). */
export const MIN_DELIVERABLE_LEGS = 2;
```

- [ ] **Step 4: Insert the reject-on-under-delivery check**

In `server/fulfill-order.ts`, add the import and insert the check immediately after the `runJob` result is logged (after the `log(\`run ${rec.runId} completed …\`)` line, before building `text`):

```ts
// top of file, with the other constant imports
import { MIN_DELIVERABLE_LEGS, REQUIRED_LEGS } from "@/src/constants";
```

```ts
  // Never charge for an under-delivered kit. Only a thrown engine error used to
  // trigger a reject; a graceful 0/1-leg run would still deliver an empty/thin
  // note and keep the payment. Reject below the minimum so the buyer's escrow is
  // not released (CAP "no proof, no payment").
  if (rec.assets.length < MIN_DELIVERABLE_LEGS) {
    const reason = `delivered ${rec.assets.length} of ${REQUIRED_LEGS.length} legs (minimum ${MIN_DELIVERABLE_LEGS}) — order rejected, not charged`;
    log(`order ${orderId}: ${reason}`);
    await deps.provider.rejectOrder(orderId, reason);
    return { status: "rejected", orderId, reason };
  }
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm test:run server/fulfill-order.test.ts`
Expected: PASS. Then `pnpm test:run && pnpm typecheck` — full suite green.

- [ ] **Step 6: Commit**

```bash
git add src/constants.ts server/fulfill-order.ts server/fulfill-order.test.ts
git commit -S -m "feat(door-b): reject under-delivered orders instead of charging for an empty kit"
```

---

## Task 3: Intake scope-guard (Fix 2)

**Files:**
- Modify: `src/engine/intake.ts` (schema + prompt + `OutOfScopeError`)
- Test: `src/engine/intake.test.ts`

**Interfaces:**
- Produces: `class OutOfScopeError extends Error`; `buildBrief` throws it when the model returns `inScope: false`. Returned `LaunchBrief` never carries `inScope`/`scopeReason`.

- [ ] **Step 1: Write the failing tests**

Add to `src/engine/intake.test.ts` (follow the file's existing `fakeLlm` pattern — a stub whose `completeJson` returns the object):

```ts
import { buildBrief, OutOfScopeError } from "./intake.js";

it("throws OutOfScopeError when the model flags the request out of scope", async () => {
  const llm = { completeText: async () => "", completeJson: (async () => ({
    product: "", audience: "", features: [], tone: "", oneLiner: "", inScope: false, scopeReason: "not a launchable product",
  })) as any } as any;
  await expect(buildBrief(llm, { text: "write me a smart contract" })).rejects.toBeInstanceOf(OutOfScopeError);
});

it("returns a clean LaunchBrief (no scope fields) when in scope", async () => {
  const llm = { completeText: async () => "", completeJson: (async () => ({
    product: "Streaky", audience: "devs", features: ["streaks"], tone: "playful", oneLiner: "Track habits.", inScope: true, scopeReason: "",
  })) as any } as any;
  const brief = await buildBrief(llm, { text: "a privacy-first habit tracker" });
  expect(brief.product).toBe("Streaky");
  expect((brief as any).inScope).toBeUndefined();
  expect((brief as any).scopeReason).toBeUndefined();
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test:run src/engine/intake.test.ts`
Expected: FAIL — `OutOfScopeError` is not exported; scope fields leak into the brief.

- [ ] **Step 3: Extend the schema, prompt, and add the error + guard**

In `src/engine/intake.ts`:

```ts
export class OutOfScopeError extends Error {
  constructor(reason: string) { super(reason); this.name = "OutOfScopeError"; }
}

const briefSchema = z.object({
  product: z.string(),
  audience: z.string(),
  features: z.array(z.string()),
  tone: z.string(),
  oneLiner: z.string(),
  inScope: z.boolean(),
  scopeReason: z.string(),
});
```

Extend the prompt (append to the existing prompt string, before `.completeJson`):

```ts
  const prompt =
    `You are Praeco's intake analyst. From the material below, infer a concise launch brief.\n\n` +
    `${context}\n\n` +
    `Respond with JSON: {"product":string,"audience":string,"features":string[],"tone":string,"oneLiner":string,"inScope":boolean,"scopeReason":string}.\n` +
    `product = what it is in a few words; audience = who it's for; features = 3-6 key selling points; ` +
    `tone = the voice for marketing copy; oneLiner = a punchy one-sentence pitch.\n` +
    `inScope = false ONLY if this is clearly NOT a product/project/service that could have a marketing launch ` +
    `(e.g. a coding task like "write me a smart contract", pure gibberish, or an unrelated request). ` +
    `When in doubt, set inScope = true. scopeReason = a one-sentence explanation when inScope is false, else "".`;
```

Replace the final two lines (`const brief = …; return sourceUrl ? … : brief;`) with:

```ts
  const raw = await llm.completeJson(prompt, briefSchema);
  if (!raw.inScope) throw new OutOfScopeError(raw.scopeReason || "request is not a launchable product");
  const { inScope: _i, scopeReason: _s, ...brief } = raw; // strip scope fields — not part of LaunchBrief
  return sourceUrl ? { ...brief, sourceUrl } : brief;
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test:run src/engine/intake.test.ts`
Expected: PASS. Then `pnpm test:run && pnpm typecheck`.

**Note (verify, don't guess):** the existing `run.test.ts` `fakeLlm` returns an intake object WITHOUT `inScope`/`scopeReason`. Because `briefSchema` now requires them, `completeJson` in that test (which bypasses zod) still returns the object, but `raw.inScope` is `undefined` → falsy → would throw `OutOfScopeError`. **Update `run.test.ts`'s intake stub** to include `inScope: true, scopeReason: ""`, and any other test whose `fakeLlm` returns an intake brief. Grep: `rg "intake analyst" -l src`.

- [ ] **Step 5: Commit**

```bash
git add src/engine/intake.ts src/engine/intake.test.ts src/engine/run.test.ts
git commit -S -m "feat(intake): reject clearly out-of-scope requests (folded-in inScope flag)"
```

---

## Task 4: Reputation module (Fix 4a)

**Files:**
- Create: `src/cap/reputation.ts`
- Test: `src/cap/reputation.test.ts`

**Interfaces:**
- Produces:
  - `interface RepEntry { accepts: number; rejects: number; lastSeen: string }`
  - `type ReputationStore = Record<string, RepEntry>`
  - `type QaOutcome = "accept" | "reject"`
  - `qualityScore(entry?: RepEntry): number` — `(accepts+1)/(accepts+rejects+2)`, unseen → 0.5
  - `applyOutcomes(store, outcomes: {agentId, outcome}[], now: string): ReputationStore`
  - `loadReputation(file?): Promise<ReputationStore>`
  - `saveReputation(store, file?): Promise<void>`
  - `scorerFrom(store): (agentId: string) => number`

- [ ] **Step 1: Write the failing tests**

Create `src/cap/reputation.test.ts`:

```ts
import { describe, it, expect, afterEach } from "vitest";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { qualityScore, applyOutcomes, loadReputation, saveReputation, scorerFrom, type ReputationStore } from "./reputation.js";

describe("qualityScore", () => {
  it("scores an unseen agent at the 0.5 neutral prior", () => {
    expect(qualityScore(undefined)).toBeCloseTo(0.5);
    expect(qualityScore({ accepts: 0, rejects: 0, lastSeen: "" })).toBeCloseTo(0.5);
  });
  it("rewards accepts and penalizes rejects (smoothed)", () => {
    expect(qualityScore({ accepts: 3, rejects: 0, lastSeen: "" })).toBeCloseTo(4 / 5);
    expect(qualityScore({ accepts: 0, rejects: 2, lastSeen: "" })).toBeCloseTo(1 / 4);
    expect(qualityScore({ accepts: 1, rejects: 1, lastSeen: "" })).toBeCloseTo(0.5);
  });
});

describe("applyOutcomes", () => {
  it("increments accepts/rejects and stamps lastSeen", () => {
    const store: ReputationStore = {};
    applyOutcomes(store, [{ agentId: "a", outcome: "accept" }, { agentId: "a", outcome: "reject" }, { agentId: "b", outcome: "accept" }], "2026-07-05T00:00:00.000Z");
    expect(store.a).toEqual({ accepts: 1, rejects: 1, lastSeen: "2026-07-05T00:00:00.000Z" });
    expect(store.b).toEqual({ accepts: 1, rejects: 0, lastSeen: "2026-07-05T00:00:00.000Z" });
  });
  it("ignores empty agentIds", () => {
    const store: ReputationStore = {};
    applyOutcomes(store, [{ agentId: "", outcome: "accept" }], "t");
    expect(Object.keys(store)).toHaveLength(0);
  });
});

describe("load/save", () => {
  let dir: string;
  afterEach(async () => { if (dir) await rm(dir, { recursive: true, force: true }); });
  it("round-trips a store and returns {} for a missing file", async () => {
    dir = await mkdtemp(join(tmpdir(), "praeco-rep-"));
    const file = join(dir, "reputation.json");
    expect(await loadReputation(file)).toEqual({});
    await saveReputation({ a: { accepts: 2, rejects: 1, lastSeen: "t" } }, file);
    expect(JSON.parse(await readFile(file, "utf8"))).toEqual({ a: { accepts: 2, rejects: 1, lastSeen: "t" } });
    expect(await loadReputation(file)).toEqual({ a: { accepts: 2, rejects: 1, lastSeen: "t" } });
  });
});

describe("scorerFrom", () => {
  it("returns a closure scoring by agentId with the neutral prior for unknowns", () => {
    const score = scorerFrom({ a: { accepts: 3, rejects: 0, lastSeen: "t" } });
    expect(score("a")).toBeCloseTo(4 / 5);
    expect(score("unknown")).toBeCloseTo(0.5);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test:run src/cap/reputation.test.ts`
Expected: FAIL — `./reputation.js` does not exist.

- [ ] **Step 3: Implement the module**

Create `src/cap/reputation.ts`:

```ts
/**
 * Per-agent reputation from Praeco's OWN QA outcomes — not marketplace-reported
 * popularity. A Bayesian success rate with a neutral (0.5) prior so unseen
 * agents are still tried and earn a record. Best-effort JSON persistence
 * (swallowed on a read-only serverless FS; persists on a long-lived host).
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

export interface RepEntry { accepts: number; rejects: number; lastSeen: string }
export type ReputationStore = Record<string, RepEntry>;
export type QaOutcome = "accept" | "reject";

export function reputationFile(): string {
  return process.env.REPUTATION_FILE ?? join(process.env.RUNS_DIR ?? "./runs", "reputation.json");
}

/** Bayesian success rate with a neutral 0.5 prior. Unseen agent → 0.5. */
export function qualityScore(entry?: RepEntry): number {
  const a = entry?.accepts ?? 0;
  const r = entry?.rejects ?? 0;
  return (a + 1) / (a + r + 2);
}

/** Apply QA outcomes to the store (mutates + returns it). `now` is an ISO string. */
export function applyOutcomes(store: ReputationStore, outcomes: { agentId: string; outcome: QaOutcome }[], now: string): ReputationStore {
  for (const { agentId, outcome } of outcomes) {
    if (!agentId) continue;
    const e = store[agentId] ?? { accepts: 0, rejects: 0, lastSeen: now };
    if (outcome === "accept") e.accepts += 1; else e.rejects += 1;
    e.lastSeen = now;
    store[agentId] = e;
  }
  return store;
}

/** Best-effort load — {} when absent/unreadable (serverless ephemeral FS). */
export async function loadReputation(file = reputationFile()): Promise<ReputationStore> {
  try {
    const parsed = JSON.parse(await readFile(file, "utf8"));
    return parsed && typeof parsed === "object" ? (parsed as ReputationStore) : {};
  } catch { return {}; }
}

/** Best-effort save — swallowed on a read-only FS (serverless). */
export async function saveReputation(store: ReputationStore, file = reputationFile()): Promise<void> {
  try {
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, JSON.stringify(store, null, 2), "utf8");
  } catch { /* read-only FS (serverless) — reputation is ephemeral there */ }
}

/** A scorer closure over a loaded store — for discoverForLeg's qualityScoreOf. */
export function scorerFrom(store: ReputationStore): (agentId: string) => number {
  return (agentId: string) => qualityScore(store[agentId]);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test:run src/cap/reputation.test.ts`
Expected: PASS. Then `pnpm typecheck`.

- [ ] **Step 5: Commit**

```bash
git add src/cap/reputation.ts src/cap/reputation.test.ts
git commit -S -m "feat(reputation): QA-outcome reputation store with a neutral-prior quality score"
```

---

## Task 5: Discovery ranks by qualityScore, not popularity (Fix 4b)

**Files:**
- Modify: `src/cap/discovery.ts` (`RankedListing`, `fuse`, comparator, `discoverForLeg` opts)
- Test: `src/cap/discovery.test.ts`

**Interfaces:**
- Consumes: `qualityScoreOf?: (agentId: string) => number` in `discoverForLeg` opts (absent → all 0.5).
- Produces: `RankedListing.qualityScore: number` (replaces `repScore`); sort order `formatDeRank → relevance → qualityScore → completionRate → price`. `completionRate` remains on `RankedListing`.

- [ ] **Step 1: Write the failing test**

Add to `src/cap/discovery.test.ts` (follow the file's existing fixture style for `ServiceListing[]` + `Map<string, AgentRecord>`):

```ts
it("ranks by our qualityScore over marketplace popularity", () => {
  const services = [
    { serviceId: "s-pop", agentId: "pop", name: "Market Research Report", priceBaseUnits: "100000" },
    { serviceId: "s-good", agentId: "good", name: "Market Research Report", priceBaseUnits: "100000" },
  ];
  const agents = new Map<string, AgentRecord>([
    ["pop", { agentId: "pop", name: "Popular", completedOrders: 5000, completionRate: 1, skillTagSlugs: [], services: [] }],
    ["good", { agentId: "good", name: "ProvenHere", completedOrders: 3, completionRate: 1, skillTagSlugs: [], services: [] }],
  ]);
  // "good" has a strong Praeco QA record; "pop" is unseen (0.5). Same relevance + price.
  const qualityScoreOf = (id: string) => (id === "good" ? 0.9 : 0.5);
  const ranked = discoverForLeg(services as any, agents, "research", "market research report", { qualityScoreOf });
  expect(ranked[0].agentId).toBe("good"); // work-record beats popularity
});

it("defaults every agent to a neutral score when no scorer is given", () => {
  const services = [{ serviceId: "s1", agentId: "a1", name: "Landing Page Copy", priceBaseUnits: "100000" }];
  const agents = new Map<string, AgentRecord>([["a1", { agentId: "a1", name: "A", completedOrders: 10, completionRate: 1, skillTagSlugs: [], services: [] }]]);
  const ranked = discoverForLeg(services as any, agents, "landing_copy", "landing page copy", {});
  expect(ranked[0].qualityScore).toBeCloseTo(0.5);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test:run src/cap/discovery.test.ts`
Expected: FAIL — `qualityScoreOf` is not an accepted opt; `RankedListing` has no `qualityScore`.

- [ ] **Step 3: Update `RankedListing`, `fuse`, comparator, and opts**

In `src/cap/discovery.ts`:

Replace `repScore: number;` in `interface RankedListing` with:
```ts
  qualityScore: number;   // Praeco's own QA-outcome score (0..1); 0.5 = neutral/unseen
```

Add `qualityScoreOf` to the `discoverForLeg` opts type:
```ts
  opts: { preferredServiceId?: string; limit?: number; excludeAgentId?: string; qualityScoreOf?: (agentId: string) => number } = {},
```

In `fuse`, replace the `repScore: completionRate * Math.log10(completedOrders + 1),` line with:
```ts
      relevance, qualityScore: opts.qualityScoreOf ? opts.qualityScoreOf(s.agentId) : 0.5,
```
(remove the standalone `relevance,` that preceded `repScore` if it duplicates — `relevance` must appear exactly once in the returned object.)

Replace the comparator's reputation line. The `matches.sort` becomes:
```ts
  matches.sort((a, b) => {
    if (a.formatDeRank !== b.formatDeRank) return a.formatDeRank - b.formatDeRank; // inline (0) before code (1)
    if (b.relevance !== a.relevance) return b.relevance - a.relevance;
    if (b.qualityScore !== a.qualityScore) return b.qualityScore - a.qualityScore; // our QA record
    if (b.completionRate !== a.completionRate) return b.completionRate - a.completionRate; // marketplace fulfillment, secondary
    return priceOf(a.priceBaseUnits) - priceOf(b.priceBaseUnits);
  });
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test:run src/cap/discovery.test.ts`
Expected: PASS. Fix any existing discovery test that asserted an ordering driven by the old `log10(orders)` term (popularity no longer breaks ties — `completionRate` then price does). Then `pnpm test:run && pnpm typecheck`.

- [ ] **Step 5: Commit**

```bash
git add src/cap/discovery.ts src/cap/discovery.test.ts
git commit -S -m "feat(discovery): rank by QA-outcome qualityScore over marketplace popularity"
```

---

## Task 6: Wire reputation through the run + gate + prompt (Fix 4c)

**Files:**
- Modify: `src/engine/context.ts` (add `qaOutcomes`, `qualityScoreOf` to `RunContext`)
- Modify: `src/engine/tools.ts` (`search_marketplace` passes `qualityScoreOf`; `qa_review` records outcomes)
- Modify: `src/engine/run.ts` (load store → scorer into ctx; persist outcomes at run end)
- Modify: `src/cap/fulfillability.ts` (`AssessOpts.qualityScoreOf`; gate loads the store)
- Modify: `src/engine/agent.ts` (prompt: prefer QA track record)
- Test: `src/engine/tools.test.ts` (qa_review outcome capture), `src/engine/run.test.ts` (persistence)

**Interfaces:**
- Consumes: `loadReputation`, `applyOutcomes`, `saveReputation`, `scorerFrom` from `../cap/reputation.js`; `HireResult.agentId`.
- Produces: `RunContext.qaOutcomes: { agentId: string; outcome: "accept" | "reject" }[]`; `RunContext.qualityScoreOf?: (agentId: string) => number`.

- [ ] **Step 1: Write the failing tests**

Add a qa_review outcome-capture test. In `src/engine/tools.test.ts` (follow its existing `RunContext` stub pattern; if the file builds a `ctx`, add `qaOutcomes: []` to it):

```ts
it("qa_review records a reputation outcome for the hired agent", async () => {
  const ctx = makeCtx(); // existing helper; ensure it includes qaOutcomes: []
  ctx.pendingHires.set("o1", { orderId: "o1", agentId: "a1", leg: "research", deliverable: { type: "text", text: "x".repeat(200), contentHash: "0x" } } as any);
  ctx.llm = { completeText: async () => "", completeJson: (async () => ({ action: "accept", reason: "ok", score: 90 })) as any } as any;
  const tools = Object.fromEntries(buildTools(ctx).map((t) => [t.name, t]));
  await tools.qa_review.execute("x", { orderId: "o1" });
  expect(ctx.qaOutcomes).toEqual([{ agentId: "a1", outcome: "accept" }]);
});
```

Add a persistence test to `src/engine/run.test.ts` (reuses the file's `scriptedDriver`, `fakeLlm`, `happyClient`, `fetchImpl`). Put a `beforeEach`/`afterEach` at the top of the main `describe` to isolate the store to a temp file:

```ts
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

let repDir: string;
beforeEach(async () => { repDir = await mkdtemp(join(tmpdir(), "praeco-run-rep-")); process.env.REPUTATION_FILE = join(repDir, "reputation.json"); });
afterEach(async () => { delete process.env.REPUTATION_FILE; await rm(repDir, { recursive: true, force: true }); });

it("persists a QA-accept reputation outcome for the hired agent after a run", async () => {
  await runLaunchJob({ text: "a habit tracker" }, {
    config, llm: fakeLlm, client: happyClient(), model: {} as any, streamFn: (async () => {}) as any,
    fetchImpl, drive: scriptedDriver, now: () => 1,
  });
  const store = JSON.parse(await readFile(process.env.REPUTATION_FILE!, "utf8"));
  expect(store.a1.accepts).toBe(3); // three legs, all QA-accepted, all hired from agent a1
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test:run src/engine/tools.test.ts src/engine/run.test.ts`
Expected: FAIL — `ctx.qaOutcomes` undefined; no reputation file written.

- [ ] **Step 3: Extend `RunContext`**

In `src/engine/context.ts`, add to the `RunContext` interface (after `assets`):

```ts
  qaOutcomes: { agentId: string; outcome: "accept" | "reject" }[]; // per-run QA record, persisted at run end
  qualityScoreOf?: (agentId: string) => number;                    // reputation scorer for discovery ranking
```

- [ ] **Step 4: Capture outcomes + pass the scorer in tools**

In `src/engine/tools.ts`:

In `search_marketplace`'s `discoverForLeg` call, add the scorer:
```ts
      const top = discoverForLeg(ctx.catalog, ctx.agentsById, leg, query, {
        preferredServiceId: ctx.config.preferredServiceIds[leg],
        excludeAgentId: ctx.config.selfAgentId,
        limit: SEARCH_CANDIDATE_LIMIT,
        qualityScoreOf: ctx.qualityScoreOf,
      });
```

In `qa_review`'s `execute`, after `ctx.verdicts.set(h.orderId, verdict);`, add:
```ts
      ctx.qaOutcomes.push({ agentId: h.agentId, outcome: verdict.action === "accept" ? "accept" : "reject" });
```

- [ ] **Step 5: Load + persist in the run**

In `src/engine/run.ts`, add the import:
```ts
import { loadReputation, applyOutcomes, saveReputation, scorerFrom } from "../cap/reputation.js";
```

Before building `ctx` (after `const brief = await buildBrief(...)`), load the store:
```ts
  const reputation = await loadReputation();
```

Add the two new fields to the `ctx` object literal (alongside `assets: new Map()`):
```ts
    assets: new Map(),
    qaOutcomes: [],
    qualityScoreOf: scorerFrom(reputation),
```

After `const endedAt = now();` (before the `return`), persist:
```ts
  applyOutcomes(reputation, ctx.qaOutcomes, new Date(endedAt).toISOString());
  await saveReputation(reputation);
```

- [ ] **Step 6: Gate consistency + prompt**

In `src/cap/fulfillability.ts`:
- Add `qualityScoreOf?: (agentId: string) => number;` to `AssessOpts`.
- In `assessFulfillability`'s `discoverForLeg` call, add `qualityScoreOf: opts.qualityScoreOf,` to the opts object.
- In `checkFulfillability`, load the store and pass the scorer. Add import `import { loadReputation, scorerFrom } from "./reputation.js";`, then before `assessFulfillability(...)`:
```ts
  const reputation = await loadReputation();
```
and add `qualityScoreOf: scorerFrom(reputation),` to the `assessFulfillability` opts object.

In `src/engine/agent.ts`, replace the line 26 prompt fragment:
```ts
    `1. search_marketplace(leg, query): find candidates. Prefer specialists with a strong track record in Praeco's own QA (qualityScore), then high completionRate. ` +
      `Avoid 0-order stubs — they accept but may never deliver.`,
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `pnpm test:run src/engine/tools.test.ts src/engine/run.test.ts`
Expected: PASS. Then the full gate: `pnpm test:run && pnpm typecheck && pnpm exec next build`.

- [ ] **Step 8: Commit**

```bash
git add src/engine/context.ts src/engine/tools.ts src/engine/run.ts src/cap/fulfillability.ts src/engine/agent.ts src/engine/tools.test.ts src/engine/run.test.ts
git commit -S -m "feat(reputation): capture QA outcomes per run and rank discovery + gate by them"
```

---

## Task 7: Judge-facing integrity & limitations doc (Fix 5)

**Files:**
- Create: `docs/integrity-and-limitations.md`
- Modify: `docs/BUIDL.md` (add a link under Links), `README.md` (optional link)

**Interfaces:** none (documentation).

- [ ] **Step 1: Write the doc**

Create `docs/integrity-and-limitations.md` — an honest Q&A answering all 13 audit questions, structured as **What Praeco does (with the fixes)** and **Known limitations + roadmap**. Cover, accurately reflecting the shipped code:
- **Task scope:** fixed 3-leg kit; shape validation (`server/gating.ts`) + the new `inScope` scope-guard; the Door B pre-accept fulfillability gate; the Door A asymmetry (deployed Door A is the `$0` sandbox).
- **QA:** art-director LLM verdict + the new binding `score ≥ 70` gate + the hard "must be accept to submit" + `MAX_PAID_ATTEMPTS_PER_LEG = 2`; validity is LLM-judged (stated), the 4 composed posts aren't per-asset QA'd (roadmap).
- **Money / refunds:** no buyer-refund primitive in the CROO SDK (protocol limitation); spend-forward with pre-spend gates; **Door B now rejects (no charge) below 2/3 legs**; redo/swap remain sunk cost (stated). Escrow-return on `rejectOrder` is protocol behavior (on-chain confirmation pending money-go).
- **Selection:** now **QA-outcome reputation** (our own work-judgment, neutral prior) as the primary signal over marketplace popularity; residual keyword-relevance + self-reported completionRate (roadmap).
- **Resilience:** real-money runs on the CLI/long-lived host; deployed web app is the `$0` sandbox; no incremental persistence/stream-resume (roadmap); spend committed at pay-time within a live process.

Keep it factual and self-aware — it pre-empts judge probing.

- [ ] **Step 2: Link it**

In `docs/BUIDL.md`, add under `## Links`:
```md
- **Integrity & limitations:** [`docs/integrity-and-limitations.md`](./integrity-and-limitations.md)
```

- [ ] **Step 3: Verify + commit**

Run: `pnpm test:run && pnpm typecheck` (unchanged; docs only).

```bash
git add docs/integrity-and-limitations.md docs/BUIDL.md README.md
git commit -S -m "docs: add judge-facing integrity & limitations Q&A"
```

---

## Final verification (before PR)

- [ ] `pnpm test:run` — full suite green.
- [ ] `pnpm typecheck` — clean.
- [ ] `pnpm exec next build` — clean.
- [ ] `pnpm door-b:sim` — a healthy sim still delivers; confirm a 0/1-leg sim path rejects (manually or via the added tests).
- [ ] `/code-review high` on the branch; address findings.
- [ ] Open PR `feat/integrity-hardening` → main; merge `--merge --delete-branch` (auto-deploys Vercel — docs/engine only, sandbox unaffected).
- [ ] **Money-gated, separate:** confirm on-chain that CAP returns the buyer's escrow on `rejectOrder` after payment (Task 2) with one real under-delivering Door B order.

## Self-review (against the spec)

- **Coverage:** Fix 1 → Task 2; Fix 2 → Task 3; Fix 3 → Task 1; Fix 4 → Tasks 4-6; Fix 5 → Task 7. All spec sections mapped.
- **Placeholders:** none — every code/test step carries real code and exact commands.
- **Type consistency:** `qualityScoreOf: (agentId: string) => number` is identical across `discoverForLeg` opts (Task 5), `RunContext` (Task 6), `AssessOpts` (Task 6). `qaOutcomes` shape `{ agentId: string; outcome: "accept" | "reject" }[]` matches between `RunContext`, `qa_review`, and `applyOutcomes`. `RankedListing.repScore` fully replaced by `qualityScore` (verified no external usages).

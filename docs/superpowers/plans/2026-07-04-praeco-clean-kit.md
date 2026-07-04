# Clean 3/3 Kit — Engine §7 Fix — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Praeco's engine reliably produce a QA-accepted 3/3 launch kit on the LIVE marketplace by rejecting redemption-code/link-only deliverables, steering discovery toward inline providers, and bounding money loss when a leg cannot be satisfied.

**Architecture:** Four surgical, defense-in-depth changes to the existing agent-loop engine — (1) a deterministic pre-LLM QA gate that forces `swap` on deliverables with no substantive inline content; (2) format-aware discovery that captures the dropped `deliverableType` and de-ranks "Code"/redemption-titled services; (3) a per-leg paid-attempt cap plus pin-escape enforced by the money guard; (4) tool/prompt wiring so a failed pinned provider opens discovery to alternatives and the run degrades gracefully to a partial kit. The existing graceful-partial compose path (`run.ts`/`compose.ts`) is reused unchanged — these changes only stop the money bleed and steer toward inline providers so that path is reached cleanly.

**Tech Stack:** TypeScript (ESM, `.js` import specifiers), Vitest, Zod, `@earendil-works/pi-agent-core`. Engine lives under `src/`. No new dependencies.

## Global Constraints

- **$0 / mock-only.** No live USDC, no mainnet calls. Every test uses mock fetch/client. (Capturing a real on-chain clean-3/3 replay is a separate, wallet-gated step — NOT in this plan.)
- **Engine `src/*` is proven — touch deliberately.** Preserve all existing money invariants (per-leg cap, run budget, idempotent `paidOrderIds`, `commit()` at pay-time).
- **TDD, one commit per task.** Every task: write failing test → verify it fails → minimal implementation → full suite green → commit.
- **Green before every commit:** `pnpm test:run` (currently 160 tests) AND `pnpm typecheck` AND `pnpm exec next build` must pass. Each task adds tests; none may leave the suite red.
- **No AI attribution** in any commit message. GPG-sign commits (`git commit -S`, key `BF47B9DC1FA320FA`).
- **ESM import specifiers use `.js`** even for `.ts` files (e.g. `import { deliverableToText } from "./provenance.js"`). Match the existing style exactly.
- **2-space indent, meaningful names, comments only for non-obvious logic** — match surrounding code density.

---

## File Structure

**Modified:**
- `src/engine/qa.ts` — add `formatGate()` + `substantiveWordCount()`; call the gate first in `reviewDeliverable()`; sharpen the LLM prompt. (Task 1)
- `src/engine/qa.test.ts` — new gate tests; update two existing fixtures to be gate-passing. (Task 1)
- `src/engine/tools.test.ts` — update the shared `happyClient()` delivery fixture to substantive prose. (Task 1)
- `src/engine/run.test.ts` — update the shared `happyClient()` delivery fixture + the `ogImageRef` assertion. (Task 1)
- `src/types.ts` — add `deliverableType?: string` to `ServiceCandidate`. (Task 2)
- `src/cap/discovery.ts` — capture `deliverableType` in `AgentService`/`mapAgentService`/`candidateFromAgent`; add `formatDeRank` + `isCodeFormat()`; de-rank in `discoverForLeg` sort. (Task 2)
- `src/cap/discovery.test.ts` — new tests for `deliverableType` capture + code de-rank. (Task 2)
- `src/constants.ts` — add `MAX_PAID_ATTEMPTS_PER_LEG`. (Task 3)
- `src/engine/context.ts` — add `paidAttemptsByLeg` + `escapedPins` to `RunContext`. (Task 3)
- `src/engine/run.ts` — initialize the two new ledgers. (Task 3)
- `src/engine/guard.ts` — enforce the per-leg cap + abandoned-pin block. (Task 3)
- `src/engine/guard.test.ts` — extend the ctx helper; new cap + escaped-pin tests. (Task 3)
- `src/engine/tools.ts` — increment `paidAttemptsByLeg` on paid; set `escapedPins` on `swap` for a pinned leg; omit the pin from discovery once escaped; surface `deliverableType` in the candidate summary. (Task 4)
- `src/engine/agent.ts` — system-prompt line on graceful partial + swap→search. (Task 4)
- `src/engine/tools.test.ts` — new escape-marking + pin-omission tests. (Task 4)
- `src/engine/run.test.ts` — integration money-safety proof (pin delivers code → escape → inline alt). (Task 5)

**No new files.** All changes extend existing modules and their sibling test files.

---

## Task 1: Deterministic QA format-gate

Force `swap` (deterministically, before spending an LLM call) when a deliverable carries no substantive inline content for its leg — the live Pygm "Code" failure mode (a redemption code + platform link, no usable prose/image). Text legs need inline prose; `og_image` needs an image URL or a substantive spec.

**Files:**
- Modify: `src/engine/qa.ts`
- Test: `src/engine/qa.test.ts`
- Modify (fixture fallout): `src/engine/tools.test.ts:20`, `src/engine/run.test.ts:33` + `:73`

**Interfaces:**
- Consumes: `deliverableToText(d: Deliverable): string` from `./provenance.js`; types `LegKind`, `Deliverable`, `QaVerdict` from `../types.js`.
- Produces:
  - `export const MIN_TEXT_WORDS = 20`
  - `export const MIN_IMAGE_SPEC_WORDS = 15`
  - `export function formatGate(leg: LegKind, deliverable: Deliverable): QaVerdict | null` — returns a `swap` verdict when the deliverable fails the format check, else `null` (fall through to the LLM).
  - `reviewDeliverable` unchanged signature; now returns the gate verdict when the gate fires.

- [ ] **Step 1: Write the failing tests**

Add to `src/engine/qa.test.ts` (keep the existing imports; add `formatGate` to the import from `./qa.js`):

```ts
import { reviewDeliverable, qaVerdictSchema, formatGate, MIN_TEXT_WORDS } from "./qa.js";
import type { Deliverable } from "../types.js";

const textDeliverable = (text: string): Deliverable => ({ type: "text", text, contentHash: "0x" });
const SUBSTANTIVE =
  "Market research shows privacy-first habit trackers resonate with indie developers who want " +
  "local-first tools, no mandatory cloud, and a one-time purchase over subscriptions, with strong " +
  "open-source positioning against gamified incumbents.";

describe("formatGate", () => {
  it("swaps an empty deliverable", () => {
    expect(formatGate("landing_copy", textDeliverable(""))?.action).toBe("swap");
  });

  it("swaps a redemption-code/link-only text deliverable (no inline prose)", () => {
    const g = formatGate("landing_copy", textDeliverable("Redeem at https://pygm.studio/r/ABC-123 code ABC-123"));
    expect(g?.action).toBe("swap");
    expect(g?.reason).toMatch(/inline/i);
  });

  it("passes substantive inline prose for a text leg (falls through to the LLM)", () => {
    expect(formatGate("landing_copy", textDeliverable(SUBSTANTIVE))).toBeNull();
    expect(formatGate("research", textDeliverable(SUBSTANTIVE))).toBeNull();
  });

  it("passes an og_image delivered as an image URL", () => {
    expect(formatGate("og_image", textDeliverable("https://cdn.example.com/og-1200x630.png"))).toBeNull();
  });

  it("passes an og_image delivered as a substantive spec (no URL)", () => {
    expect(formatGate("og_image", textDeliverable(SUBSTANTIVE))).toBeNull();
  });

  it("swaps an og_image that is only a redemption link (no image URL, no spec)", () => {
    const g = formatGate("og_image", textDeliverable("Access your image at https://pygm.studio/r/XYZ"));
    expect(g?.action).toBe("swap");
  });
});

describe("reviewDeliverable format-gate integration", () => {
  it("returns swap WITHOUT calling the LLM when the format gate fires", async () => {
    const llm = fakeLlm({ action: "accept", reason: "should not be used", score: 99 });
    const verdict = await reviewDeliverable(llm, brief, "landing_copy", textDeliverable("code ABC-123"));
    expect(verdict.action).toBe("swap");
    expect((llm.completeJson as any)).not.toHaveBeenCalled();
  });
});
```

Then UPDATE the two existing tests whose tiny fixtures would now trip the gate (their intent is "LLM verdict passes through" — give them gate-passing content):

```ts
  it("returns the critic verdict and feeds the deliverable + brief into the prompt", async () => {
    const llm = fakeLlm({ action: "accept", reason: "on-brief", score: 82 });
    const verdict = await reviewDeliverable(llm, brief, "landing_copy", textDeliverable(
      "Headline: Streaky — habit tracking, local-first. Privacy-first habit tracker for indie developers; " +
      "your data stays on your machine, no account, no cloud dependency, no subscription. Install now.",
    ));
    expect(verdict).toEqual({ action: "accept", reason: "on-brief", score: 82 });
    const prompt = (llm.completeJson as any).mock.calls[0][0] as string;
    expect(prompt).toContain("Streaky");
    expect(prompt).toContain("landing_copy");
    expect(prompt).toContain("builders");
    expect(prompt).toContain("playful");
    expect((llm.completeJson as any).mock.calls[0][1]).toBe(qaVerdictSchema);
  });

  it("passes through a redo verdict", async () => {
    const llm = fakeLlm({ action: "redo", reason: "off-tone" });
    const verdict = await reviewDeliverable(llm, brief, "research", textDeliverable(
      "Competitive analysis of the habit-tracker market covering incumbents, pricing models, and the " +
      "local-first positioning opportunity for indie developers seeking privacy and one-time purchases.",
    ));
    expect(verdict.action).toBe("redo");
  });
```

(The prompt assertion previously checked `"habit streaks"`; remove that line — the new copy does not contain that exact phrase.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm exec vitest run src/engine/qa.test.ts`
Expected: FAIL — `formatGate` is not exported (`formatGate is not a function` / import error).

- [ ] **Step 3: Implement the gate in `src/engine/qa.ts`**

Add above `reviewDeliverable`:

```ts
/** Words with at least one alphanumeric char, after stripping URLs — the "substantive inline content" signal. */
export const MIN_TEXT_WORDS = 20;
export const MIN_IMAGE_SPEC_WORDS = 15;

const IMAGE_URL_RE = /https?:\/\/\S+\.(?:png|jpe?g|webp|gif|svg|avif)(?:\?\S*)?/i;

function substantiveWordCount(text: string): number {
  const withoutUrls = text.replace(/https?:\/\/\S+/gi, " ");
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
export function formatGate(leg: LegKind, deliverable: Deliverable): QaVerdict | null {
  const raw = deliverableToText(deliverable).trim();
  if (!raw) {
    return { action: "swap", reason: "deliverable is empty — no inline content for this leg; hire a provider that delivers inline content" };
  }
  if (leg === "og_image") {
    // An image can legitimately arrive as an image URL OR a substantive spec/description.
    // A bare platform/redemption link (not an image URL) with no spec is the failure mode.
    if (IMAGE_URL_RE.test(raw)) return null;
    if (substantiveWordCount(raw) >= MIN_IMAGE_SPEC_WORDS) return null;
    return { action: "swap", reason: "og_image deliverable has neither an image URL nor a substantive spec (looks like a redemption code/link) — swap to a provider that delivers an inline image or a detailed image spec" };
  }
  const words = substantiveWordCount(raw);
  if (words < MIN_TEXT_WORDS) {
    return { action: "swap", reason: `${leg} deliverable has only ${words} words of inline content (redemption-code/link format, not usable prose) — swap to a provider that delivers inline ${leg}` };
  }
  return null;
}
```

Then call it first inside `reviewDeliverable`, right after the JSDoc/opening brace, before the `REVIEW_LIMIT` line:

```ts
export async function reviewDeliverable(
  llm: Llm,
  brief: LaunchBrief,
  leg: LegKind,
  deliverable: Deliverable,
): Promise<QaVerdict> {
  const gated = formatGate(leg, deliverable);
  if (gated) return gated; // deterministic swap — do not spend an LLM call on a wrong-format deliverable
  // Review a generous slice — research reports run long ...
```

Also sharpen the LLM prompt so it is a backstop for wordy-but-contentless redemption messages. Change the format-agnostic line (currently `Do NOT penalise content-type/format...`) to append one sentence:

```ts
    `Do NOT penalise content-type/format: an og_image deliverable provided as a URL or image description is fine — judge its quality and relevance, not its file type.\n` +
    `The deliverable MUST contain the actual usable content inline. If it only provides a redemption code, an access link, or instructions to retrieve the content elsewhere (rather than the content itself), return "swap".\n` +
```

- [ ] **Step 4: Fix the fixture fallout in the two integration test files**

In `src/engine/tools.test.ts`, the shared `happyClient()` delivers `"research findings"` (2 words) which the gate would now swap, breaking the `qa_review` accept tests. Change line 20:

```ts
    getDelivery: vi.fn(async () => ({ deliverableType: "text", deliverableText:
      "Market research: indie developers want privacy-first, local-first habit tracking with no mandatory cloud, " +
      "a one-time purchase over subscriptions, and strong open-source positioning against gamified incumbents.",
      contentHash: "0xh" })),
```

In `src/engine/run.test.ts`, the scripted driver hires one service for all three legs; `happyClient().getDelivery` returns `"https://cdn/og.png"` which the gate swaps for the research + landing legs. Change line 33 to substantive prose (passes all three legs: ≥20 words for text legs, ≥15 spec words for og_image):

```ts
    getDelivery: vi.fn(async () => ({ deliverableType: "text", deliverableText:
      "Privacy-first habit tracker research: indie developers want local-first tools, no mandatory cloud, " +
      "one-time purchase pricing, and calm developer-focused positioning against gamified incumbents like Habitica.",
      contentHash: "0xh" })),
```

Because the delivery is now prose (not a bare URL), `extractImageRef` yields a hash reference. Update the assertion at line 73:

```ts
    expect(rec.kit?.ogImageRef).toBe("hash:0xh");
```

- [ ] **Step 5: Run the full suite to verify green**

Run: `pnpm test:run`
Expected: PASS — all tests green (new gate tests pass; updated fixtures pass; count increases by the new `formatGate`/integration cases).

Run: `pnpm typecheck`
Expected: PASS — no type errors.

- [ ] **Step 6: Commit**

```bash
git add src/engine/qa.ts src/engine/qa.test.ts src/engine/tools.test.ts src/engine/run.test.ts
git commit -S -m "feat(engine): deterministic QA format-gate — swap redemption-code/link-only deliverables (§7)"
```

---

## Task 2: Format-aware discovery — capture `deliverableType` + de-rank "Code" services

Steer discovery toward inline providers: capture the `deliverableType` the API returns but discovery currently drops, and rank code/redemption-titled services below all inline services for a leg (de-rank, not exclude — they remain as last-resort candidates).

**Files:**
- Modify: `src/types.ts` (add `deliverableType?` to `ServiceCandidate`)
- Modify: `src/cap/discovery.ts`
- Test: `src/cap/discovery.test.ts`

**Interfaces:**
- Consumes: existing `ServiceListing`, `AgentRecord`, `discoverForLeg`, `mapAgentService`, `candidateFromAgent`.
- Produces:
  - `AgentService.deliverableType?: string`
  - `ServiceCandidate.deliverableType?: string`
  - `RankedListing.formatDeRank: number` (0 = inline/preferred, 1 = code/redemption format)
  - de-ranked ordering in `discoverForLeg` (inline services sort before code services regardless of relevance).

- [ ] **Step 1: Write the failing tests**

Add to `src/cap/discovery.test.ts`:

```ts
describe("getAgent — captures deliverableType", () => {
  it("parses deliverableType from the agent service record", async () => {
    const f = jsonFetch({ "/public/agents/13506a9a": OPS_AGENT });
    const a = await getAgent("https://api.croo.network", "13506a9a", f);
    expect(a.services[0].deliverableType).toBe("schema");
  });
});

describe("discoverForLeg — de-ranks code/redemption services", () => {
  const services: ServiceListing[] = [
    { serviceId: "pygm-image", agentId: "pygm", name: "Pygm Studio Image Code", priceBaseUnits: "500000" },
    { serviceId: "inline-image", agentId: "foundr", name: "OG Image Generator", description: "inline og image", priceBaseUnits: "500000" },
  ];
  const agentsById = new Map<string, AgentRecord>([
    ["pygm", { agentId: "pygm", name: "Pygm", completedOrders: 1401, completionRate: 1, skillTagSlugs: [], services: [] }],
    ["foundr", { agentId: "foundr", name: "Foundr", completedOrders: 500, completionRate: 1, skillTagSlugs: [], services: [] }],
  ]);

  it("ranks the inline image provider above the higher-reputation 'Code' provider", () => {
    const ranked = discoverForLeg(services, agentsById, "og_image", "og image");
    expect(ranked[0].serviceId).toBe("inline-image"); // de-ranked despite lower reputation
    expect(ranked.map((r) => r.serviceId)).toContain("pygm-image"); // still present (de-rank, not exclude)
    expect(ranked.find((r) => r.serviceId === "pygm-image")?.formatDeRank).toBe(1);
    expect(ranked.find((r) => r.serviceId === "inline-image")?.formatDeRank).toBe(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm exec vitest run src/cap/discovery.test.ts`
Expected: FAIL — `deliverableType` undefined; `formatDeRank` undefined; `inline-image` does not rank first (the higher-rep "Code" service currently wins).

- [ ] **Step 3: Implement in `src/cap/discovery.ts`**

Add `deliverableType` to the `AgentService` interface:

```ts
export interface AgentService {
  serviceId: string;
  title: string;
  price: string;
  requirementType: string;            // "schema" | "text"
  requirementSchema: RequirementField[];
  requirementText?: string;
  deliverableType?: string;           // "text" | "schema" — what the provider returns (was dropped pre-§7)
}
```

Set it in `mapAgentService` (add the field to the returned object):

```ts
    requirementText: s.requirementText ? String(s.requirementText) : undefined,
    deliverableType: s.deliverableType ? String(s.deliverableType) : undefined,
  };
```

Set it in `candidateFromAgent` (add to the returned candidate):

```ts
    avgDeliveryText: agent.avgDeliveryText,
    onlineStatus: agent.onlineStatus,
    deliverableType: svc.deliverableType,
  };
```

Add `formatDeRank` to `RankedListing`:

```ts
export interface RankedListing extends ServiceListing {
  agentName: string;
  completedOrders: number;
  completionRate: number;
  onlineStatus?: string;
  skillTagSlugs: string[];
  relevance: number;
  repScore: number;
  formatDeRank: number;   // 0 = inline provider; 1 = code/redemption-titled (last resort for a leg)
}
```

Add the detector above `discoverForLeg`:

```ts
/**
 * A service whose title/description signals a redemption-code delivery format
 * (e.g. Pygm "… Code" services) rather than inline content. These deliver a
 * code + platform link, not usable copy/image (§7), so they are de-ranked below
 * all inline providers for a leg — kept as last-resort candidates, not excluded.
 */
export function isCodeFormat(name: string, description: string): boolean {
  return /\bcode\b|\bredemption\b|\bredeem\b|\bvoucher\b/i.test(`${name} ${description}`);
}
```

In `discoverForLeg`, set `formatDeRank` in the `fuse` helper and make it the primary sort key:

```ts
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
```

In the pinned-override branch, the pin is authoritative — set its `formatDeRank` to 0 so the shape is consistent (the pin is the operator's vetted choice regardless of title):

```ts
  if (opts.preferredServiceId) {
    const pinned = services.find((s) => s.serviceId === opts.preferredServiceId);
    return pinned ? [{ ...fuse(pinned, 999), formatDeRank: 0 }] : [];
  }
```

Update the sort so inline services always precede code services, then relevance → reputation → price:

```ts
  matches.sort((a, b) => {
    if (a.formatDeRank !== b.formatDeRank) return a.formatDeRank - b.formatDeRank; // inline (0) before code (1)
    if (b.relevance !== a.relevance) return b.relevance - a.relevance;
    if (b.repScore !== a.repScore) return b.repScore - a.repScore;
    return priceOf(a.priceBaseUnits) - priceOf(b.priceBaseUnits);
  });
```

Add `deliverableType` to `ServiceCandidate` in `src/types.ts`:

```ts
export interface ServiceCandidate {
  serviceId: string;
  agentId: string;
  agentName: string;
  title: string;                 // service title
  priceBaseUnits: string;        // USDC base units, decimal string
  requirementType: string;       // "schema" | "text"
  requirementSchema: RequirementField[];
  requirementText?: string;
  completedOrders: number;
  completionRate: number;        // 0..1
  avgDeliveryText?: string;
  onlineStatus?: string;
  orders7d?: number;
  deliverableType?: string;      // "text" | "schema" — what the provider returns
}
```

- [ ] **Step 4: Run the full suite to verify green**

Run: `pnpm test:run`
Expected: PASS — new discovery tests pass; existing `discoverForLeg` tests still pass (in those fixtures the code service is the only leg match, so de-rank does not change the asserted order).

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/cap/discovery.ts src/cap/discovery.test.ts src/types.ts
git commit -S -m "feat(engine): format-aware discovery — capture deliverableType, de-rank code/redemption services (§7)"
```

---

## Task 3: Per-leg paid-attempt cap + escaped-pin block (state + money guard)

Add the per-leg paid-attempt ledger and the escaped-pins set to the run context, and enforce two new money-safety blocks in `beforeToolCall`: refuse a hire once a leg hits the paid-attempt cap (bounds money loss on an unsatisfiable leg), and refuse re-hiring a pinned provider that has been abandoned after failing QA.

**Files:**
- Modify: `src/constants.ts`
- Modify: `src/engine/context.ts`
- Modify: `src/engine/run.ts`
- Modify: `src/engine/guard.ts`
- Test: `src/engine/guard.test.ts`

**Interfaces:**
- Consumes: `RunContext`, `BudgetGuard`, existing `makeBeforeToolCall`.
- Produces:
  - `export const MAX_PAID_ATTEMPTS_PER_LEG = 2` (constants.ts)
  - `RunContext.paidAttemptsByLeg: Map<LegKind, number>` — paid hires per leg (incremented in Task 4)
  - `RunContext.escapedPins: Set<LegKind>` — legs whose pin was abandoned → discovery opens (set in Task 4)
  - `makeBeforeToolCall` now blocks: (a) a leg at the paid-attempt cap, (b) a hire of the abandoned pin serviceId on an escaped leg.

- [ ] **Step 1: Write the failing tests**

Extend the `ctx()` helper in `src/engine/guard.test.ts` to include the new fields + a `config` (the guard now reads `ctx.config.preferredServiceIds`):

```ts
function ctx(over: Partial<RunContext> = {}): RunContext {
  return Object.assign(
    {
      budget: new BudgetGuard(2_000_000n, 600_000n), worklog: new Worklog(),
      candidates: new Map([["s1", cand("100000")]]), assets: new Map(),
      requiredLegs: ["research"], pendingHires: new Map(), verdicts: new Map(), paidOrderIds: new Set(),
      paidAttemptsByLeg: new Map(), escapedPins: new Set(),
      config: { apiUrl: "", rpcUrl: "", agentWallet: "", usdcTokenAddress: "", preferredServiceIds: {} },
    },
    over,
  ) as RunContext;
}
```

Add the new guard tests:

```ts
  it("blocks a hire once the leg hits the paid-attempt cap", async () => {
    const c = ctx({ paidAttemptsByLeg: new Map([["research", 2]]) });
    const r = await makeBeforeToolCall(c)(call("hire_specialist", { leg: "research", serviceId: "s1" }));
    expect(r?.block).toBe(true);
    expect(r?.reason).toMatch(/cap/i);
    expect(c.worklog.events.at(-1)?.kind).toBe("hire_blocked");
  });

  it("blocks re-hiring an abandoned pinned provider on an escaped leg", async () => {
    const c = ctx({
      escapedPins: new Set(["research"]),
      config: { apiUrl: "", rpcUrl: "", agentWallet: "", usdcTokenAddress: "", preferredServiceIds: { research: "s1" } },
    });
    const r = await makeBeforeToolCall(c)(call("hire_specialist", { leg: "research", serviceId: "s1" }));
    expect(r?.block).toBe(true);
    expect(r?.reason).toMatch(/abandoned|different provider/i);
  });

  it("allows a DIFFERENT provider on an escaped leg", async () => {
    const c = ctx({
      candidates: new Map([["s1", cand("100000")], ["alt", { ...cand("100000"), serviceId: "alt" }]]),
      escapedPins: new Set(["research"]),
      config: { apiUrl: "", rpcUrl: "", agentWallet: "", usdcTokenAddress: "", preferredServiceIds: { research: "s1" } },
    });
    expect(await makeBeforeToolCall(c)(call("hire_specialist", { leg: "research", serviceId: "alt" }))).toBeUndefined();
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm exec vitest run src/engine/guard.test.ts`
Expected: FAIL — the cap/escape branches don't exist yet, so the allow/block expectations don't hold (and `MAX_PAID_ATTEMPTS_PER_LEG` is not imported).

- [ ] **Step 3: Add the constant in `src/constants.ts`**

```ts
/** Hard backstop against a runaway agent loop (turns = one LLM call + its tool batch). */
export const MAX_TURNS = 24;

/** Max PAID hires per leg before the guard stops spending on it (bounds loss on an unsatisfiable leg). */
export const MAX_PAID_ATTEMPTS_PER_LEG = 2;
```

- [ ] **Step 4: Add the ledgers to `RunContext` in `src/engine/context.ts`**

In the `// per-run ledgers` block:

```ts
  // per-run ledgers
  candidates: Map<string, ServiceCandidate>; // serviceId -> resolved candidate
  pendingHires: Map<string, HireResult>;      // orderId -> hire result awaiting QA/submit
  verdicts: Map<string, QaVerdict>;           // orderId -> QA verdict
  paidOrderIds: Set<string>;                  // idempotency ledger
  paidAttemptsByLeg: Map<LegKind, number>;    // paid hires per leg (money-loss bound, §7)
  escapedPins: Set<LegKind>;                  // legs whose pin was abandoned after failing QA → discovery opens (§7)
  assets: Map<LegKind, LaunchAsset>;          // submitted, QA-accepted, one per leg
```

- [ ] **Step 5: Initialize them in `src/engine/run.ts`**

In the `ctx` literal, alongside the other ledgers:

```ts
    candidates: new Map(),
    pendingHires: new Map(),
    verdicts: new Map(),
    paidOrderIds: new Set(),
    paidAttemptsByLeg: new Map(),
    escapedPins: new Set(),
    assets: new Map(),
```

- [ ] **Step 6: Enforce the blocks in `src/engine/guard.ts`**

Add the import:

```ts
import { baseUnitsToUsd, MAX_PAID_ATTEMPTS_PER_LEG } from "../constants.js";
```

Insert the two new checks in `makeBeforeToolCall`, after the `assets.has` block and before the candidate lookup:

```ts
    if (a.leg && ctx.assets.has(a.leg)) return block(`leg ${a.leg} already has a submitted asset — do not hire it again`);
    if (a.leg && (ctx.paidAttemptsByLeg?.get(a.leg) ?? 0) >= MAX_PAID_ATTEMPTS_PER_LEG) {
      return block(`leg ${a.leg} reached the ${MAX_PAID_ATTEMPTS_PER_LEG}-paid-hire cap without a QA-accepted asset — stop hiring for this leg and finish with the legs you have`);
    }
    if (a.leg && a.serviceId && ctx.escapedPins?.has(a.leg) && a.serviceId === ctx.config.preferredServiceIds[a.leg]) {
      return block(`pinned provider ${a.serviceId} was abandoned after failing QA on ${a.leg} — hire a DIFFERENT provider for this leg`);
    }
    const c = a.serviceId ? ctx.candidates.get(a.serviceId) : undefined;
```

(Optional-chaining `?.` on the two new maps keeps the guard safe for any future `RunContext` builder that omits them — degrading to current behavior rather than crashing.)

- [ ] **Step 7: Run the full suite to verify green**

Run: `pnpm test:run`
Expected: PASS — new guard tests pass; existing guard tests still pass (the new fields default to empty in the helper).

Run: `pnpm typecheck`
Expected: PASS — `RunContext` builders (`run.ts` + test helpers) all set the new fields. NOTE: `src/engine/tools.test.ts`'s `ctxFor` is updated in Task 4; if typecheck is run standalone here it will flag `ctxFor` as missing the two fields — add `paidAttemptsByLeg: new Map(), escapedPins: new Set(),` to `ctxFor` now (it is harmless before Task 4 wires their use).

- [ ] **Step 8: Commit**

```bash
git add src/constants.ts src/engine/context.ts src/engine/run.ts src/engine/guard.ts src/engine/guard.test.ts src/engine/tools.test.ts
git commit -S -m "feat(engine): per-leg paid-attempt cap + escaped-pin block in money guard (§7)"
```

---

## Task 4: Wire cap increment, pin-escape, and prompt into the tools

Make the tools drive the Task-3 state: increment `paidAttemptsByLeg` when a hire is paid; on a `swap` verdict for a pinned leg, mark the pin escaped (so the next search opens discovery); omit an escaped pin from discovery; surface `deliverableType` in the candidate summary; and add a system-prompt line so the agent searches again after a swap and accepts a partial kit.

**Files:**
- Modify: `src/engine/tools.ts`
- Modify: `src/engine/agent.ts`
- Test: `src/engine/tools.test.ts`

**Interfaces:**
- Consumes: `RunContext.paidAttemptsByLeg`, `RunContext.escapedPins`, `RunContext.config.preferredServiceIds` (Task 3); `ServiceCandidate.deliverableType` (Task 2).
- Produces: no new exported symbols — behavior changes to `search_marketplace`, `hire_specialist` (onPaid), and `qa_review` tool executes, plus the `systemPrompt` string.

- [ ] **Step 1: Write the failing tests**

Add to `src/engine/tools.test.ts`. First, extend `ctxFor` so tests can pin + observe escape (add the two ledgers if not already added in Task 3; add a `preferredServiceIds` override capability):

```ts
function ctxFor(client: CapBuyer, llm: Llm, over: Partial<RunContext> = {}): RunContext {
  return {
    brief: { product: "Streaky", audience: "builders", features: ["x"], tone: "playful", oneLiner: "Track habits." },
    llm, client, budget: new BudgetGuard(2_000_000n, 600_000n), worklog: new Worklog(),
    config: { apiUrl: "https://api", rpcUrl: "https://rpc", agentWallet: "0xee47", usdcTokenAddress: "0x8335", preferredServiceIds: {} },
    fetchImpl: fundedFetch, requiredLegs: ["research"], hirePollOpts: { negotiationPolls: 2, deliveryPolls: 2, sleep: async () => {} },
    candidates: new Map([["s1", candidate]]), pendingHires: new Map(), verdicts: new Map(), paidOrderIds: new Set(),
    paidAttemptsByLeg: new Map(), escapedPins: new Set(), assets: new Map(),
    ...over,
  };
}
```

Then the new tests:

```ts
describe("§7 cap + pin-escape wiring", () => {
  it("increments paidAttemptsByLeg when a hire is paid", async () => {
    const ctx = ctxFor(happyClient(), fakeLlm({}));
    await toolMap(ctx).hire_specialist.execute("id", { leg: "research", serviceId: "s1", requirements: { topic: "x" } });
    expect(ctx.paidAttemptsByLeg.get("research")).toBe(1);
  });

  it("marks a pinned leg escaped when QA returns swap", async () => {
    const ctx = ctxFor(happyClient(), fakeLlm({ action: "swap", reason: "wrong format" }), {
      config: { apiUrl: "https://api", rpcUrl: "https://rpc", agentWallet: "0xee47", usdcTokenAddress: "0x8335", preferredServiceIds: { research: "s1" } },
    });
    await toolMap(ctx).hire_specialist.execute("id", { leg: "research", serviceId: "s1", requirements: { topic: "x" } });
    await toolMap(ctx).qa_review.execute("id", { orderId: "o1" });
    expect(ctx.escapedPins.has("research")).toBe(true);
  });

  it("does NOT escape a non-pinned leg on swap", async () => {
    const ctx = ctxFor(happyClient(), fakeLlm({ action: "swap", reason: "wrong format" }));
    await toolMap(ctx).hire_specialist.execute("id", { leg: "research", serviceId: "s1", requirements: { topic: "x" } });
    await toolMap(ctx).qa_review.execute("id", { orderId: "o1" });
    expect(ctx.escapedPins.has("research")).toBe(false);
  });

  it("omits an escaped pin from discovery (opens to alternatives)", async () => {
    const ctx = ctxFor(happyClient(), fakeLlm({}), {
      config: { apiUrl: "https://api", rpcUrl: "https://rpc", agentWallet: "0xee47", usdcTokenAddress: "0x8335", preferredServiceIds: { og_image: "pygm-image" } },
      escapedPins: new Set(["og_image"]),
    });
    ctx.candidates.clear();
    ctx.fetchImpl = catalogFetch();
    const res = await toolMap(ctx).search_marketplace.execute("id", { leg: "og_image", query: "og image" });
    // With the pin escaped, discovery ranks the catalog (still surfaces pygm-image, but not as a forced sole candidate).
    const ids = (res.details as any).candidates as string[];
    expect(ids.length).toBeGreaterThanOrEqual(1);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm exec vitest run src/engine/tools.test.ts`
Expected: FAIL — `paidAttemptsByLeg` not incremented; `escapedPins` not set on swap.

- [ ] **Step 3: Increment the paid-attempt ledger in `hire_specialist` (`src/engine/tools.ts`)**

In the `onPaid` callback inside the `hire` tool:

```ts
          onPaid: (price, orderId) => {
            ctx.budget.commit(price);
            ctx.paidOrderIds.add(orderId);
            ctx.paidAttemptsByLeg.set(leg, (ctx.paidAttemptsByLeg.get(leg) ?? 0) + 1);
          },
```

- [ ] **Step 4: Escape a pinned leg on `swap` in `qa_review` (`src/engine/tools.ts`)**

After `ctx.verdicts.set(h.orderId, verdict);` and the `qa_verdict` emit, before building `guidance`:

```ts
      ctx.worklog.emit({ kind: "qa_verdict", at: Date.now(), leg: h.leg, message: `QA ${verdict.action}: ${verdict.reason}`, data: { score: verdict.score } });
      if (verdict.action === "swap" && ctx.config.preferredServiceIds[h.leg] && !ctx.escapedPins.has(h.leg)) {
        ctx.escapedPins.add(h.leg);
        ctx.worklog.emit({ kind: "hire_blocked", at: Date.now(), leg: h.leg, message: `pinned provider failed QA (swap) — opening discovery to alternative providers for ${h.leg}` });
      }
```

- [ ] **Step 5: Omit an escaped pin from discovery in `search_marketplace` (`src/engine/tools.ts`)**

Change the `preferredServiceId` argument passed to `discoverForLeg`:

```ts
      const top = discoverForLeg(ctx.catalog, ctx.agentsById, leg, query, {
        preferredServiceId: ctx.escapedPins.has(leg) ? undefined : ctx.config.preferredServiceIds[leg],
        limit: 5,
      });
```

- [ ] **Step 6: Surface `deliverableType` in the candidate summary (`src/engine/tools.ts`)**

In the `summary` builder line inside `search_marketplace`, append the delivery format so the LLM can prefer inline providers:

```ts
      const summary = ranked
        .map((c) => `- serviceId=${c.serviceId} agent="${c.agentName}" price=$${usd(c.priceBaseUnits)} completionRate=${(c.completionRate * 100).toFixed(1)}% orders=${c.completedOrders} delivers=${c.deliverableType ?? "?"} requires=[${c.requirementSchema.map((f) => f.name + (f.required ? "*" : "")).join(", ")}]`)
        .join("\n");
```

- [ ] **Step 7: Add the system-prompt guidance in `src/engine/agent.ts`**

Change the final two guidance lines of `systemPrompt` to steer swap→search and accept a partial kit:

```ts
    `Do one leg at a time. When every required leg has a submitted asset, STOP — make no further tool calls and hire nothing extra.`,
    `Be decisive and frugal: one good, QA-passed hire per leg is the goal.`,
    `On a "swap" verdict, call search_marketplace again for that leg and hire a DIFFERENT provider — do not re-hire the same one.`,
    `If a leg stays blocked after repeated attempts (hire_blocked), stop trying it and finish with the legs you have — a partial kit is acceptable.`,
```

- [ ] **Step 8: Run the full suite to verify green**

Run: `pnpm test:run`
Expected: PASS — new wiring tests pass; existing tools/agent tests still pass. NOTE: `src/engine/agent.test.ts` asserts the tool-name set (unaffected); if it snapshots the prompt, update that snapshot — verify by reading the assertion. The `search_marketplace` summary change adds `delivers=…`; no existing test asserts the exact summary string (the search tests assert `details.candidates` ids only).

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add src/engine/tools.ts src/engine/agent.ts src/engine/tools.test.ts
git commit -S -m "feat(engine): wire paid-attempt cap + pin-escape into tools; prompt for swap→search + graceful partial (§7)"
```

---

## Task 5: Integration money-safety proof — pin delivers code → escape → inline alt

Prove the composition end-to-end with a faithful stand-in for the agent loop (hires gated through `makeBeforeToolCall`, exactly as the real loop does): a pinned research provider delivers a redemption code → QA format-gate swaps it → the pin is escaped → discovery opens → an inline alternative is hired and accepted. Assert the research asset comes from the inline provider, the pin-escape event fired, and spend is bounded to two paid hires (under the cap).

**Files:**
- Modify: `src/engine/run.test.ts` (add one integration test + local fixtures)

**Interfaces:**
- Consumes: `runLaunchJob`, `buildTools`, `makeBeforeToolCall`, `EngineDriver`, `RunContext`.
- Produces: no exports — a test proving the money-safety composition.

- [ ] **Step 1: Write the failing test**

Add to `src/engine/run.test.ts` (add `makeBeforeToolCall` to the imports from `./guard.js`):

```ts
import { makeBeforeToolCall } from "./guard.js";

// A mock CAP client where the PINNED provider (svc "pin-bad") delivers a
// redemption code (no inline content) and the inline alternative ("inline-good")
// delivers usable prose. getDelivery/getOrder key off the negotiated serviceId.
function escapeClient(): CapBuyer {
  const orderService: Record<string, string> = {};
  let n = 0;
  const deliverables: Record<string, string> = {
    "pin-bad": "Your report is ready. Redeem code RSCH-9F2A at https://pygm.studio/r/RSCH-9F2A",
    "inline-good": "Market research: privacy-first habit trackers resonate with indie developers who want " +
      "local-first tools, no mandatory cloud, one-time purchase pricing, and open-source positioning.",
  };
  return {
    negotiateOrder: vi.fn(async (req: any) => { orderService[`ord-${++n}`] = req.serviceId; return { negotiationId: `neg-${n}` }; }),
    getNegotiation: vi.fn(async () => ({ status: "pending" })),
    listOrders: vi.fn(async () => [{ orderId: `ord-${n}`, negotiationId: `neg-${n}`, price: "100000", status: "created" }]),
    getOrder: vi.fn(async (id: string) => ({ status: "created", price: "100000", deliverTxHash: `0xd-${id}` })),
    payOrder: vi.fn(async () => ({ txHash: "0xpay" })),
    getDelivery: vi.fn(async (id: string) => ({ deliverableType: "text", deliverableText: deliverables[orderService[id] ?? "inline-good"], contentHash: `0xh-${id}` })),
  };
}

// Catalog with the pinned bad provider + an inline research alternative.
const escapeFetch = (async (url: string, init?: RequestInit) => {
  if (init?.method === "POST") return new Response(JSON.stringify({ result: "0x00000000000000000000000000000000000000000000000000000000001e8480" }), { status: 200 });
  const u = String(url);
  const agents: Record<string, unknown> = {
    pygm: { agent: { agentId: "pygm", name: "Pygm", completedOrders: "1401", completionRate: 100, onlineStatus: "online", skillTagSlugs: ["content-creative"], services: [{ serviceId: "pin-bad", name: "Research Redemption Code", price: "100000", requirementType: "text", requirementSchema: "[]", deliverableType: "text" }] } },
    zeru: { agent: { agentId: "zeru", name: "ZERU", completedOrders: "500", completionRate: 100, onlineStatus: "online", skillTagSlugs: ["research-report"], services: [{ serviceId: "inline-good", name: "Verifiable Research Report", price: "100000", requirementType: "text", requirementSchema: "[]", deliverableType: "text" }] } },
  };
  const m = u.match(/\/public\/agents\/([^/?]+)/);
  if (m) return new Response(JSON.stringify(agents[m[1]] ?? {}), { status: 200 });
  if (u.includes("/public/agents")) return new Response(JSON.stringify({ agents: [
    { agentId: "pygm", name: "Pygm", completedOrders: "1401", completionRate: 100, onlineStatus: "online", skillTagSlugs: ["content-creative"] },
    { agentId: "zeru", name: "ZERU", completedOrders: "500", completionRate: 100, onlineStatus: "online", skillTagSlugs: ["research-report"] },
  ], total: "2" }), { status: 200 });
  if (u.includes("/public/services")) return new Response(JSON.stringify(u.includes("page=1") ? { items: [
    { serviceId: "pin-bad", agentId: "pygm", name: "Research Redemption Code", description: "research report", price: "100000", orders7d: "50" },
    { serviceId: "inline-good", agentId: "zeru", name: "Verifiable Research Report", description: "market intelligence report", price: "100000", orders7d: "9" },
  ], total: "2" } : { items: [], total: "2" }), { status: 200 });
  return new Response("not found", { status: 404 });
}) as unknown as typeof fetch;

describe("runLaunchJob — §7 pin-escape money safety", () => {
  it("escapes a code-delivering pin, hires the inline alternative, and bounds spend", async () => {
    // Faithful agent-loop stand-in: gate every hire through beforeToolCall, like the real loop.
    const escapeDriver: EngineDriver = async (ctx: RunContext) => {
      const tools = Object.fromEntries(buildTools(ctx).map((t) => [t.name, t]));
      const guard = makeBeforeToolCall(ctx);
      const tryHire = async (leg: string, serviceId: string) => {
        const blocked = await guard({ toolCall: { name: "hire_specialist" }, args: { leg, serviceId } } as any);
        if (blocked?.block) return null;
        return tools.hire_specialist.execute("x", { leg, serviceId, requirements: { topic: "habits" } });
      };
      // Attempt 1: the pinned bad provider (discovery returns only the pin).
      await tools.search_marketplace.execute("x", { leg: "research", query: "research" });
      const h1 = await tryHire("research", "pin-bad");
      await tools.qa_review.execute("x", { orderId: (h1!.details as any).orderId }); // formatGate -> swap -> escape
      // Attempt 2: pin escaped, discovery opens; hire the inline alternative.
      await tools.search_marketplace.execute("x", { leg: "research", query: "research" });
      const h2 = await tryHire("research", "inline-good");
      await tools.qa_review.execute("x", { orderId: (h2!.details as any).orderId }); // accept
      await tools.submit_asset.execute("x", { orderId: (h2!.details as any).orderId });
      return {};
    };

    const rec = await runLaunchJob(
      { text: "Streaky habit tracker" },
      {
        ...baseDeps(),
        client: escapeClient(),
        fetchImpl: escapeFetch,
        config: { ...config, preferredServiceIds: { research: "pin-bad" } },
        drive: escapeDriver,
      },
    );

    // Only research was driven → partial, and its asset is from the INLINE provider (not the code pin).
    expect(rec.status).toBe("partial");
    expect(rec.assets).toHaveLength(1);
    expect(rec.assets[0].leg).toBe("research");
    expect(rec.assets[0].hire.serviceId).toBe("inline-good");
    // Two paid hires on research (pin + inline) — under the cap, bounded spend.
    expect(rec.spentBaseUnits).toBe("200000");
    // The pin-escape robustness event fired.
    expect(rec.worklog.some((e) => e.message.includes("opening discovery"))).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test to verify it passes (behavior already implemented in Tasks 1–4)**

Run: `pnpm exec vitest run src/engine/run.test.ts`
Expected: PASS. If it FAILS, the failure localizes the composition bug (e.g. escape not opening discovery, or the format-gate not swapping the code delivery) — fix in the owning module, not the test.

- [ ] **Step 3: Run the full suite + typecheck + build**

Run: `pnpm test:run`
Expected: PASS.

Run: `pnpm typecheck`
Expected: PASS.

Run: `pnpm exec next build`
Expected: PASS (engine change is deploy-safe; Door A/B unaffected).

- [ ] **Step 4: Commit**

```bash
git add src/engine/run.test.ts
git commit -S -m "test(engine): integration proof — pin-escape hires inline alternative, bounds spend (§7)"
```

---

## Self-Review

**1. Spec coverage** (against §7, `docs/superpowers/specs/2026-06-29-praeco-phase2-doors-design.md:137-147` + parked memory `praeco-clean-kit-parked.md`):
- QA `swap` vs `redo` on wrong-format deliverable → **Task 1** (deterministic `formatGate` + LLM-prompt backstop). ✓
- Prefer inline providers over "Code" services → **Task 2** (de-rank + `deliverableType` capture). ✓
- Pin redo-cap with swap-fallback (the money bug) → **Task 3** (cap + escaped-pin guard) + **Task 4** (increment, escape-marking, pin-omission, prompt). ✓
- Graceful partial → reused unchanged (`run.ts`/`compose.ts`), proven composed in **Task 5**. ✓
- NOT building the redeem/fetch step (approach B) → correctly out of scope. ✓
- Research-leg pin still authoritative → preserved (pin path unchanged until a `swap` escapes it). ✓
- Wallet top-up + real on-chain clean-3/3 capture → explicitly out of scope (separate gated step per Global Constraints). ✓

**2. Placeholder scan:** No TBD/TODO/"handle edge cases"/"similar to". Every code step shows complete code; every test step shows the assertions. ✓

**3. Type consistency:** `formatGate(leg, deliverable)` (Task 1) used consistently. `paidAttemptsByLeg: Map<LegKind, number>` and `escapedPins: Set<LegKind>` declared in `context.ts` (Task 3), initialized in `run.ts` (Task 3) + all test ctx builders (Tasks 3–4), read in `guard.ts` (Task 3) and `tools.ts` (Task 4) with identical names. `deliverableType?: string` added to both `AgentService` and `ServiceCandidate` (Task 2), set in `mapAgentService` + `candidateFromAgent`, read in `tools.ts` summary (Task 4). `MAX_PAID_ATTEMPTS_PER_LEG` defined once (constants.ts), imported in `guard.ts`. `formatDeRank: number` on `RankedListing` set in `fuse` (both branches). ✓

**Cross-task fixture note:** Task 1 updates the shared `happyClient()` delivery fixtures in `tools.test.ts` and `run.test.ts` because the new gate would otherwise swap their short strings. Task 3 adds the two ledger fields to the `guard.test.ts` and `tools.test.ts` ctx builders. These are called out inline in the owning steps.

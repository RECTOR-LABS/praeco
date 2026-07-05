# "Mission Control" UI Revamp — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reskin the demo path (landing, intake, Theater, kit) into a cohesive cinematic "Mission Control" look for the DoraHacks demo, without changing any behavior.

> **Update (2026-07-04) — executed on an upgraded foundation.** Tasks 1–2 (hand-rolled
> Tailwind-3 tokens/primitives) were superseded mid-execution: per RECTOR, the project
> was migrated to **Tailwind v4** (codemod) and adopted **shadcn/ui + Radix** (`radix`
> base). shadcn's vars are themed onto the mission-control palette; primitives were
> rebuilt on shadcn behind their APIs. Everything else in this plan (per-surface reskin,
> preserved test assertions, verify/PR) executed as written. Commits: `243f475` (v4) →
> `0983f2d` (shadcn) → `20258c6` (polish across all surfaces). 207 tests green.

**Architecture:** A design-token layer (Tailwind theme + `globals.css` + `next/font`) feeds a small set of token-driven primitives in `components/ui/`. Each demo page/component is reskinned to consume tokens + primitives while preserving its props, data flow, and behavior. Presentation layer only.

**Tech Stack:** Next.js 15 (App Router), Tailwind 3, `geist` (next/font, self-hosted), `class-variance-authority` + `clsx` + `tailwind-merge` (all present except `geist`), Lucide, Vitest + Testing Library.

## Global Constraints

- **Behavior-preserving.** No changes to `src/**` (engine/money), `server/**`, `app/api/**`, the SSE hooks (`useLiveRunStream`, `useRunStream`), or `components/theater/reducer.ts`. Presentation only.
- **Dark-only** by deliberate choice; keep `<html className="dark">` and `color-scheme: dark`. No light theme.
- **Tests stay green.** `pnpm test:run` (203) must pass at every task boundary. Update a test only where the reskin changed the exact markup it asserts, preserving intent.
- **Preserved test assertions (do not break):**
  - Theater: text `/research/i`, text `/og image|image/i`, text `/\$0\.70/`, a link whose href contains `basescan`.
  - KitView: text `Foundr` (agentName), a link with accessible name `/basescan/i`, text `/asset reference/i` for a `hash:`-style ref, an `<img>` for an `http(s)` ref.
  - Intake: an input with placeholder `/one-liner or github/i`, a button named `/try it free|run/i`, unchanged navigation to `/run/live?...`.
  - Marketing: currently asserts a heading named `Praeco`; this test **will be updated** in Task 4 (hero headline changes; brand becomes a wordmark).
- **Money/format:** spend shown as `$<amount>` via `baseUnitsToUsd`; keep `tabular-nums` on digits. Never hardcode a chain address.
- **Verify before done:** `pnpm test:run` + `pnpm typecheck` + `pnpm exec next build` green; drive Door A locally before the final commit.
- **Git:** work on `feat/ui-mission-control`; GPG-signed commits; no AI attribution; one logical unit per commit; push via `git -c credential.helper= -c 'credential.helper=!gh auth git-credential' push origin feat/ui-mission-control`.

---

### Task 1: Design foundation — fonts, tokens, base styles, motion

**Files:**
- Modify: `package.json` (add `geist`)
- Modify: `app/layout.tsx`
- Modify: `tailwind.config.ts`
- Modify: `app/globals.css`

**Interfaces:**
- Produces: Tailwind color tokens `ground palette panel panel-2 ink muted line live danger` + `lane.{research,copy,image,money}`; `font-sans`/`font-mono` bound to Geist; `shadow-glow-{research,copy,image,live}`; `animate-{pulse-dot,meter-sweep,log-in}`; `:focus-visible` ring; a reduced-motion kill-switch. All later tasks consume these.

- [ ] **Step 1: Add the Geist font package**

Run: `pnpm add geist`
Expected: `geist` appears in `package.json` dependencies; lockfile updates.

- [ ] **Step 2: Load fonts in the root layout**

Modify `app/layout.tsx` to:

```tsx
import "./globals.css";
import type { ReactNode } from "react";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";

export const metadata = { title: "Praeco", description: "An autonomous general contractor for product launches." };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`dark ${GeistSans.variable} ${GeistMono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
```

- [ ] **Step 3: Extend the Tailwind theme with the Mission Control tokens**

Replace `tailwind.config.ts` `theme.extend` with:

```ts
import type { Config } from "tailwindcss";
export default {
  darkMode: "class",
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ground: "#05070c",
        panel: "#0b0f18",
        "panel-2": "#111726",
        ink: "#cdd6e4",
        muted: "#7f8ba5",
        line: "rgba(120,150,220,0.14)",
        live: "#43e08a",
        danger: "#f85149",
        lane: { research: "#58a6ff", copy: "#e3b341", image: "#c297ff", money: "#3fb950" },
      },
      fontFamily: {
        sans: ["var(--font-geist-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-geist-mono)", "ui-monospace", "monospace"],
      },
      boxShadow: {
        "glow-research": "0 0 16px -5px #58a6ff",
        "glow-copy": "0 0 16px -5px #e3b341",
        "glow-image": "0 0 16px -5px #c297ff",
        "glow-live": "0 0 16px -5px #43e08a",
      },
      keyframes: {
        "pulse-dot": { "0%,100%": { opacity: "1" }, "50%": { opacity: "0.35" } },
        "meter-sweep": { "0%": { transform: "translateX(-70%)" }, "100%": { transform: "translateX(180%)" } },
        "log-in": { from: { opacity: "0", transform: "translateY(4px)" }, to: { opacity: "1", transform: "none" } },
      },
      animation: {
        "pulse-dot": "pulse-dot 1.4s ease-in-out infinite",
        "meter-sweep": "meter-sweep 2.4s ease-in-out infinite",
        "log-in": "log-in 0.28s ease-out",
      },
    },
  },
  plugins: [],
} satisfies Config;
```

- [ ] **Step 4: Rewrite `app/globals.css` with base + accessibility**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

:root { color-scheme: dark; }

body { @apply bg-ground text-ink antialiased font-sans; }

/* keyboard focus: a live-tinted ring on every interactive element */
:focus-visible { outline: 2px solid #43e08a; outline-offset: 2px; border-radius: 4px; }

/* honor reduced-motion: kill all animation + transition */
@media (prefers-reduced-motion: reduce) {
  *, ::before, ::after { animation: none !important; transition: none !important; scroll-behavior: auto !important; }
}
```

- [ ] **Step 5: Verify the foundation compiles and nothing regressed**

Run: `pnpm typecheck && pnpm test:run`
Expected: typecheck clean; 203 tests still pass (existing components still use old `white/5` utility classes — that's fine, they render).

- [ ] **Step 6: Commit**

```bash
git add package.json pnpm-lock.yaml app/layout.tsx tailwind.config.ts app/globals.css
git commit -S -m "feat(ui): mission-control design tokens + Geist fonts"
```

---

### Task 2: Token-driven UI primitives

**Files:**
- Create: `components/ui/GridBackdrop.tsx`, `LiveDot.tsx`, `StatusPill.tsx`, `ConsolePanel.tsx`, `SpendMeter.tsx`, `PhaseRail.tsx`, `ReceiptChip.tsx`
- Test: `components/ui/primitives.test.tsx`

**Interfaces:**
- Produces:
  - `GridBackdrop(): JSX` — absolute-positioned decorative telemetry grid (`aria-hidden`).
  - `LiveDot({ className?: string }): JSX` — pulsing `live` dot.
  - `StatusPill({ tone, children }): JSX` where `tone: "live" | "research" | "copy" | "image" | "muted" | "danger"`.
  - `ConsolePanel({ tone?, glow?, className?, children }): JSX` where `tone?: "research" | "copy" | "image" | "live" | "danger"`, `glow?: boolean`.
  - `SpendMeter({ spentUsd, budgetUsd, live?: boolean }): JSX` — bar + `$spent / $budget` in mono tabular-nums; `live` adds the sweep animation.
  - `PhaseRail({ segments, activeIndex, blocked?: boolean }): JSX`.
  - `ReceiptChip({ href, label?, className? }): JSX` — external link; default `label="Basescan"`; renders an accessible link whose name includes the label.

- [ ] **Step 1: Write failing tests for the data-bearing primitives**

Create `components/ui/primitives.test.tsx`:

```tsx
// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { StatusPill } from "./StatusPill";
import { SpendMeter } from "./SpendMeter";
import { PhaseRail } from "./PhaseRail";
import { ReceiptChip } from "./ReceiptChip";

it("StatusPill renders its label", () => {
  render(<StatusPill tone="live">Paid</StatusPill>);
  expect(screen.getByText("Paid")).toBeInTheDocument();
});

it("SpendMeter shows spent and budget", () => {
  render(<SpendMeter spentUsd="0.70" budgetUsd="2.00" />);
  expect(screen.getByText(/\$0\.70/)).toBeInTheDocument();
  expect(screen.getByText(/\$2\.00/)).toBeInTheDocument();
});

it("PhaseRail marks the active segment count", () => {
  const { container } = render(<PhaseRail segments={8} activeIndex={3} />);
  // 8 rail segments rendered
  expect(container.querySelectorAll("[data-rail-seg]").length).toBe(8);
});

it("ReceiptChip is an external Basescan link", () => {
  render(<ReceiptChip href="https://basescan.org/tx/0xabc" />);
  const link = screen.getByRole("link", { name: /basescan/i });
  expect(link).toHaveAttribute("href", "https://basescan.org/tx/0xabc");
  expect(link).toHaveAttribute("target", "_blank");
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run components/ui/primitives.test.tsx`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement the primitives**

`components/ui/GridBackdrop.tsx`:

```tsx
export function GridBackdrop() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 -z-10"
      style={{
        backgroundImage:
          "linear-gradient(rgba(90,140,255,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(90,140,255,0.05) 1px, transparent 1px)",
        backgroundSize: "26px 26px",
        maskImage: "radial-gradient(120% 80% at 50% 0%, #000 40%, transparent 100%)",
        WebkitMaskImage: "radial-gradient(120% 80% at 50% 0%, #000 40%, transparent 100%)",
      }}
    />
  );
}
```

`components/ui/LiveDot.tsx`:

```tsx
import { cn } from "@/lib/utils";
export function LiveDot({ className }: { className?: string }) {
  return (
    <span className={cn("inline-block h-2 w-2 rounded-full bg-live shadow-glow-live animate-pulse-dot", className)} aria-hidden />
  );
}
```

`components/ui/StatusPill.tsx`:

```tsx
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const pill = cva(
  "inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider",
  {
    variants: {
      tone: {
        live: "bg-live/15 text-live",
        research: "bg-lane-research/15 text-lane-research",
        copy: "bg-lane-copy/15 text-lane-copy",
        image: "bg-lane-image/15 text-lane-image",
        danger: "bg-danger/15 text-danger",
        muted: "bg-white/8 text-muted",
      },
    },
    defaultVariants: { tone: "muted" },
  },
);

export function StatusPill({ tone, className, children }: VariantProps<typeof pill> & { className?: string; children: React.ReactNode }) {
  return <span className={cn(pill({ tone }), className)}>{children}</span>;
}
```

`components/ui/ConsolePanel.tsx`:

```tsx
import { cn } from "@/lib/utils";

const GLOW: Record<string, string> = {
  research: "border-lane-research/40 shadow-glow-research",
  copy: "border-lane-copy/40 shadow-glow-copy",
  image: "border-lane-image/40 shadow-glow-image",
  live: "border-live/40 shadow-glow-live",
  danger: "border-danger/40",
};

export function ConsolePanel({
  tone, glow, className, children,
}: { tone?: keyof typeof GLOW; glow?: boolean; className?: string; children: React.ReactNode }) {
  return (
    <div
      className={cn(
        "rounded-xl border border-line bg-panel/80 backdrop-blur-sm transition-shadow",
        glow && tone ? GLOW[tone] : "",
        className,
      )}
    >
      {children}
    </div>
  );
}
```

`components/ui/SpendMeter.tsx`:

```tsx
import { cn } from "@/lib/utils";

export function SpendMeter({ spentUsd, budgetUsd, live }: { spentUsd: string; budgetUsd: string; live?: boolean }) {
  const pct = Math.max(0, Math.min(100, (Number(spentUsd) / Number(budgetUsd || "1")) * 100));
  return (
    <div className="flex items-center gap-3">
      <span className="font-mono text-[10px] uppercase tracking-wider text-muted">Spend</span>
      <div className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-white/8">
        <div className="h-full rounded-full bg-live shadow-glow-live" style={{ width: `${pct}%` }} />
        {live && (
          <div className="absolute inset-y-0 w-1/3 animate-meter-sweep bg-gradient-to-r from-transparent via-live/40 to-transparent" />
        )}
      </div>
      <span className="font-mono text-xs tabular-nums text-ink">
        ${spentUsd} <span className="text-muted">/ ${budgetUsd}</span>
      </span>
    </div>
  );
}
```

`components/ui/PhaseRail.tsx`:

```tsx
import { cn } from "@/lib/utils";

export function PhaseRail({ segments, activeIndex, blocked }: { segments: number; activeIndex: number; blocked?: boolean }) {
  return (
    <div className="flex gap-0.5">
      {Array.from({ length: segments }).map((_, i) => (
        <div
          key={i}
          data-rail-seg
          className={cn(
            "h-1 flex-1 rounded-full transition-colors",
            blocked ? "bg-danger/60" : i <= activeIndex ? "bg-live" : "bg-white/10",
          )}
        />
      ))}
    </div>
  );
}
```

`components/ui/ReceiptChip.tsx`:

```tsx
import { CircleCheck, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";

export function ReceiptChip({ href, label = "Basescan", className }: { href: string; label?: string; className?: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        "inline-flex items-center gap-1 rounded-md border border-live/25 bg-live/10 px-2 py-1 font-mono text-[11px] text-live transition-colors hover:bg-live/20",
        className,
      )}
    >
      <CircleCheck className="h-3 w-3" />
      {label}
      <ExternalLink className="h-3 w-3" />
    </a>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run components/ui/primitives.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add components/ui/
git commit -S -m "feat(ui): mission-control primitives (panel, pill, meter, rail, receipt, dot, grid)"
```

---

### Task 3: Reskin the Theater (the hero)

**Files:**
- Modify: `components/theater/BrainBar.tsx`, `Lane.tsx`, `MoneyLedger.tsx`, `ThinkingFeed.tsx`, `Theater.tsx`
- Modify: `app/run/live/page.tsx`, `app/run/[id]/page.tsx` (swap `bg-gray-950` → `bg-ground`, restyle the back/kit links to console buttons)
- Test: existing `components/theater/Theater.test.tsx` must stay green (do not edit unless an asserted string moves)

**Interfaces:**
- Consumes: `ConsolePanel`, `StatusPill`, `LiveDot`, `SpendMeter`, `PhaseRail`, `ReceiptChip` (Task 2); `TheaterState`, `LaneState`, `Phase`, `LedgerEntry` from `./reducer` (unchanged).

- [ ] **Step 1: Reskin `BrainBar` into a status header**

Keep the `STATUS_CONFIG` / `elapsedLabel` logic. Wrap in `ConsolePanel`, use mono labels, `LiveDot` when `status === "running"`, and `SpendMeter` reading `state.spentUsd` (budget `"2.00"`, `live` when running). Preserve the `$<spentUsd>` text (Theater test asserts `$0.70`). Map status colors to tokens (`text-live`, `text-lane-copy`, `text-muted`, `text-danger`). Header row: `Praeco · Mission Control` wordmark (mono, uppercase) + product + right side elapsed + spend.

Key JSX (replace the returned markup):

```tsx
return (
  <ConsolePanel className="px-4 py-3">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-2">
        {state.status === "running" && <LiveDot />}
        <Icon className={cn("h-4 w-4", cfg.color)} />
        <span className={cn("font-mono text-xs uppercase tracking-wider", cfg.color)}>{cfg.label}</span>
        {state.product && <span className="ml-1 max-w-xs truncate text-sm text-muted">— {state.product}</span>}
      </div>
      <div className="flex items-center gap-4 text-sm">
        <span className="flex items-center gap-1 font-mono text-xs text-muted">
          <Clock className="h-3.5 w-3.5" />{elapsedLabel(state.startedAt, state.endedAt)}
        </span>
        <span className="font-mono font-semibold tabular-nums text-live">${state.spentUsd}</span>
      </div>
    </div>
  </ConsolePanel>
);
```
Update `STATUS_CONFIG` colors to `text-live` (running/completed), `text-lane-copy` (partial), `text-muted` (aborted), `text-danger` (failed).

- [ ] **Step 2: Reskin `Lane` into a glowing telemetry panel**

Reuse the `RAIL`, `PHASE_LABEL`, `LEG_LABEL` maps. Replace the inline rail with `PhaseRail segments={RAIL.length} activeIndex={RAIL.indexOf(phase)} blocked={isBlocked}`. Wrap in `ConsolePanel tone={LANE_TONE[lane.leg]} glow={lane.phase !== "idle"}`. Phase badge → `StatusPill tone={isBlocked ? "danger" : isAccepted ? "live" : LANE_TONE[lane.leg]}`. Keep `LEG_LABEL` so text `Research`/`OG image` still renders (Theater test). Keep `ReceiptChip` when `lane.basescanUrl`. Add a `LANE_TONE` map:

```tsx
const LANE_TONE = { research: "research", landing_copy: "copy", og_image: "image" } as const;
```
Agent row keeps the `User` icon + `lane.agentName`. Blocked note keeps `AlertCircle` + `lane.note`, styled with `border-danger/30 bg-danger/5 text-danger`.

- [ ] **Step 3: Reskin `MoneyLedger` into a spend console**

Wrap in `ConsolePanel`, header `On-chain receipts` as a mono uppercase label, rows use `tabular-nums` for `$amount` and `ReceiptChip` for the link (replaces the `BasescanLink` import). Keep `entry.agentName` + `$entry.amountUsd`.

- [ ] **Step 4: Reskin `ThinkingFeed` into a live log stream**

Keep the `useState(open)` toggle + `aria-expanded` (intake/behavior unaffected). Restyle to a mono log: `ConsolePanel`, `Brain` icon, `Thinking feed` label + count `StatusPill tone="muted"`. Log lines in `font-mono text-[11px] text-muted`, each with `animate-log-in`. Keep `max-h-48 overflow-y-auto`.

- [ ] **Step 5: `Theater.tsx` + run pages spacing/bg**

`Theater.tsx`: no structural change needed (it composes the four); optionally add a `MoneyLedger`+`ThinkingFeed` are already there. In `app/run/live/page.tsx` and `app/run/[id]/page.tsx`, replace `bg-gray-950` with `bg-ground` and add `<GridBackdrop />` inside a `relative` main; restyle the `Back home` / `View kit →` links to a console button (`border border-line bg-panel hover:bg-panel-2 font-mono text-xs`), keeping `href` + label text.

- [ ] **Step 6: Run the Theater test + full suite**

Run: `pnpm vitest run components/theater/Theater.test.tsx && pnpm test:run`
Expected: PASS. If the `$0.70`, `research`, `og image`, or basescan-link assertions fail, restore the exact text/label that moved (do not weaken the test).

- [ ] **Step 7: Commit**

```bash
git add components/theater/ app/run/
git commit -S -m "feat(ui): reskin Theater into the mission-control console"
```

---

### Task 4: Reskin the Landing (cinematic hero + progressive-disclosure scroll)

**Files:**
- Modify: `app/(marketing)/page.tsx`
- Create: `components/marketing/HeroPreview.tsx` (decorative ambient Theater preview — `"use client"`, canned, NO SSE/engine), `components/marketing/LandingSections.tsx` (the scroll story)
- Modify (update intent): `app/(marketing)/page.test.tsx`

**Interfaces:**
- Consumes: `GridBackdrop`, `ConsolePanel`, `StatusPill`, `LiveDot`, `SpendMeter`, `PhaseRail` (Task 2); `listRecords` + `baseUnitsToUsd` (unchanged server data).
- Produces: nothing consumed downstream.

- [ ] **Step 1: Update the marketing test to the new intent**

The hero headline changes and `Praeco` becomes a wordmark, so update `app/(marketing)/page.test.tsx`:

```tsx
// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import Landing from "./page";

vi.mock("@/server/persistence", () => ({ listRecords: vi.fn(async () => []) }));

test("landing renders the brand and the hero headline", async () => {
  render(await Landing());
  expect(screen.getByText("Praeco")).toBeInTheDocument();            // wordmark
  expect(screen.getByRole("heading", { name: /ship your launch/i })).toBeInTheDocument();
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm vitest run "app/(marketing)/page.test.tsx"`
Expected: FAIL (`/ship your launch/i` heading not present yet).

- [ ] **Step 3: Build `HeroPreview` (decorative, canned)**

`components/marketing/HeroPreview.tsx` — a `"use client"` island that loops scripted phase states with `setInterval` (NO network, NO engine). Renders 3 mini lanes (using `PhaseRail` + `StatusPill` + lane tones) + a `SpendMeter live` + a `LiveDot`. Respect reduced-motion by rendering a static "completed" frame when `matchMedia("(prefers-reduced-motion: reduce)").matches`. Keep it self-contained (≤120 lines). Example skeleton:

```tsx
"use client";
import { useEffect, useState } from "react";
import { PhaseRail } from "@/components/ui/PhaseRail";
import { StatusPill } from "@/components/ui/StatusPill";
import { SpendMeter } from "@/components/ui/SpendMeter";
import { LiveDot } from "@/components/ui/LiveDot";
import { ConsolePanel } from "@/components/ui/ConsolePanel";

const LANES = [
  { leg: "Research", tone: "research" as const, agent: "ZERU" },
  { leg: "Copy", tone: "copy" as const, agent: "Foundr" },
  { leg: "Image", tone: "image" as const, agent: "Pygm" },
];

export function HeroPreview() {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) { setTick(7); return; }
    const id = setInterval(() => setTick((t) => (t + 1) % 9), 700);
    return () => clearInterval(id);
  }, []);
  return (
    <ConsolePanel glow tone="live" className="p-4">
      <div className="mb-3 flex items-center justify-between">
        <span className="font-mono text-[10px] uppercase tracking-wider text-muted">Praeco · Mission Control</span>
        <span className="inline-flex items-center gap-1.5 font-mono text-[10px] text-live"><LiveDot /> LIVE</span>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {LANES.map((l, i) => (
          <div key={l.leg} className="rounded-lg border border-line bg-panel-2/60 p-2">
            <div className="mb-1.5 flex items-center justify-between">
              <span className="font-mono text-[10px] uppercase tracking-wider text-ink">{l.leg}</span>
              <StatusPill tone={l.tone}>{tick > i * 2 + 1 ? "paid" : "…"}</StatusPill>
            </div>
            <PhaseRail segments={8} activeIndex={Math.min(7, Math.max(0, tick - i))} />
            <div className="mt-1.5 font-mono text-[10px] text-muted">{l.agent}</div>
          </div>
        ))}
      </div>
      <div className="mt-3"><SpendMeter spentUsd="0.70" budgetUsd="2.00" live /></div>
    </ConsolePanel>
  );
}
```

- [ ] **Step 4: Build `LandingSections` (the scroll story)**

`components/marketing/LandingSections.tsx` — a server-safe component (no state) rendering the progressive-disclosure sections in the token palette, each an `<section>` with a mono eyebrow + heading + body:
1. **What it does** — one brief in → a paid-for, QA'd launch kit out (research, copy, OG image).
2. **Two doors** — Door A (this app) / Door B (CAP seller — *registered live + on-chain proven + integrity-gated*). Use two `ConsolePanel`s.
3. **On-chain proof** — real order lifecycle + a `ReceiptChip` linking the known deliver tx `https://basescan.org/tx/0x97547499e592dc1b4390e3a11213502f9fabc0dec5fe5fba4e4362cdf886ad84`.
4. **The integrity gate** — Praeco rejects a job it can't fully staff *before charging* (the differentiator).
Keep copy tight and truthful (mirror README/BUIDL wording). Use `text-ink`/`text-muted`, headings `text-balance`.

- [ ] **Step 5: Rewrite `app/(marketing)/page.tsx` hero + compose**

Keep it a server component with `listRecords()`/`force-dynamic`. Structure: `relative` main with `<GridBackdrop />`; a nav row (`Praeco` wordmark + GitHub link + `Try free` CTA); the hero (`h1` = "Ship your launch. Autonomously.", subcopy, two CTAs → `/intake?mode=sandbox` and the flagship replay/`/intake?mode=live`, `<HeroPreview />` beside/below); then `<LandingSections />`; then the restyled "Recent runs" list (console rows, mono runId, `tabular-nums` spend, keep `baseUnitsToUsd`). Preserve the `watchHref` logic. Buttons keep `Watch a run` / `Try it free` / `Run live` labels.

- [ ] **Step 6: Run the marketing test + full suite + build**

Run: `pnpm vitest run "app/(marketing)/page.test.tsx" && pnpm test:run && pnpm exec next build`
Expected: PASS (both new assertions) + 203 + clean build.

- [ ] **Step 7: Commit**

```bash
git add "app/(marketing)/" components/marketing/
git commit -S -m "feat(ui): cinematic mission-control landing with scroll story"
```

---

### Task 5: Reskin Intake (mission-briefing console)

**Files:**
- Modify: `app/intake/page.tsx`
- Test: existing `app/intake/page.test.tsx` must stay green

**Interfaces:**
- Consumes: `GridBackdrop`, `ConsolePanel`, `StatusPill` (Task 2). Keep `detect()`, the router push, `mode` from `useSearchParams`, `Suspense`.

- [ ] **Step 1: Reskin while preserving behavior + asserted strings**

Wrap the page in `bg-ground` + `<GridBackdrop />`. Put the form in a `ConsolePanel`. Frame it as a briefing: heading `Start a run`, a mono `StatusPill` showing the `mode` (sandbox/live). **Keep the input `placeholder="Paste a one-liner or GitHub URL"`** (intake test matches `/one-liner or github/i`) and **keep the submit button text `Try it free`** (test matches `/try it free|run/i`). Restyle input: `bg-panel-2 border-line focus:border-live`. Restyle button: `bg-live text-ground` (or a console primary). Keep the live-mode `LIVE_RUN_TOKEN` hint. No logic change.

- [ ] **Step 2: Run intake test + full suite**

Run: `pnpm vitest run app/intake/page.test.tsx && pnpm test:run`
Expected: PASS (placeholder + button-name + navigation assertions all hold).

- [ ] **Step 3: Commit**

```bash
git add app/intake/
git commit -S -m "feat(ui): reskin intake as a mission-briefing console"
```

---

### Task 6: Reskin the Kit (mission-complete debrief)

**Files:**
- Modify: `components/KitView.tsx`, `app/kit/[id]/page.tsx`
- Test: existing `components/KitView.test.tsx` must stay green

**Interfaces:**
- Consumes: `ConsolePanel`, `ReceiptChip`, `StatusPill` (Task 2). Keep `LaunchKit`/`ProvenanceCard` types, `copyToClipboard`, `downloadJson`, and the `isRealImage` branch.

- [ ] **Step 1: Reskin preserving asserted markup**

Wrap each asset section in `ConsolePanel`; `SectionHeader` becomes a mono uppercase label + copy button. Provenance cards → `ConsolePanel tone="live"` "receipts": keep `card.agentName` text (test wants `Foundr`), the leg via `StatusPill`, `$amountUsd` in `tabular-nums`, `contentHash` in mono, and **`ReceiptChip href={card.basescanUrl}`** (test wants a `/basescan/i` link). **Keep the `isRealImage` branch**: `<img>` for `http(s)` refs (test wants an `<img>`), and the amber "OG image — asset reference" card for non-URL refs (test matches `/asset reference/i`). Page: `bg-ground` + `<GridBackdrop />`, a "Mission complete" heading.

- [ ] **Step 2: Run KitView test + full suite**

Run: `pnpm vitest run components/KitView.test.tsx && pnpm test:run`
Expected: PASS (Foundr, basescan link, asset-reference text, img all hold).

- [ ] **Step 3: Commit**

```bash
git add components/KitView.tsx app/kit/
git commit -S -m "feat(ui): reskin the launch kit as a mission-complete debrief"
```

---

### Task 7: Verify end-to-end + deploy

**Files:** none (verification + PR)

- [ ] **Step 1: Full green gate**

Run: `pnpm test:run && pnpm typecheck && pnpm exec next build`
Expected: 203 tests pass, typecheck clean, build clean.

- [ ] **Step 2: Drive Door A locally (behavior + visual)**

Run: `pnpm dev:web`, open `http://localhost:3000`. Verify: landing hero + scroll sections render; click `Try it free` → intake → submit a one-liner → the Theater streams a sandbox run (lanes advance, spend meter moves, thinking feed logs) → completes → `View kit` → kit renders with provenance receipts. Confirm reduced-motion (OS setting) stops animations. No console errors.

- [ ] **Step 3: Push + open PR**

```bash
git -c credential.helper= -c 'credential.helper=!gh auth git-credential' push origin feat/ui-mission-control
gh pr create --repo RECTOR-LABS/praeco --base main --head feat/ui-mission-control \
  --title "feat(ui): Mission Control demo-page revamp" \
  --body "Cinematic mission-control reskin of landing/intake/Theater/kit. Presentation-layer only; behavior + tests unchanged. Spec: docs/superpowers/specs/2026-07-04-praeco-ui-revamp-design.md"
```

- [ ] **Step 4: Vercel preview sanity**

Check the PR's Vercel preview deployment renders the four pages correctly before merge. Report the preview URL.

---

## Self-review notes
- **Spec coverage:** direction/landing (Task 4), design system tokens+fonts+motion (Task 1), primitives (Task 2), per-page Theater/intake/kit (Tasks 3/5/6), accessibility focus+reduced-motion (Task 1), testing/verify/deploy (Task 7), dark-only (Task 1). All spec sections mapped.
- **Preserved assertions** enumerated in Global Constraints and re-checked in each reskin task's test step.
- **Type consistency:** primitive prop names (`tone`, `glow`, `spentUsd`/`budgetUsd`, `segments`/`activeIndex`, `href`/`label`) are used identically in Tasks 3–6.
- **No new behavior:** the only new client logic is `HeroPreview`'s decorative `setInterval`, explicitly canned (no SSE/engine/spend).

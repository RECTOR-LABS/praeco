# Praeco UI Revamp — "Mission Control" Design (2026-07-04)

> **Update (2026-07-04, mid-execution) — foundation pivot.** Per RECTOR's call, the
> component foundation was upgraded to **Tailwind CSS v4** (official codemod) +
> **shadcn/ui on Radix** (`radix` base, RSC), replacing the hand-rolled Tailwind-3
> token layer this spec originally described. The mission-control aesthetic + tokens
> are **preserved**: shadcn's semantic vars (`background`/`card`/`primary`/`muted`/
> `border`/`ring`) are mapped onto the mission-control palette in `globals.css @theme`,
> so shadcn components inherit the neon-dark look. Primitives were rebuilt on shadcn
> behind their existing APIs (StatusPill→Badge, ConsolePanel→Card aesthetic,
> buttons→Button). Dark-only + behavior-preserving + tests-green constraints held
> (207 tests). Components adopted: Button, Card, Badge, Tabs, Tooltip, ScrollArea,
> Progress, Separator, Dialog, Input, Label.

## Context & goal

Praeco's engine and both doors are done and proven; the web app (Door A) is live on Vercel but visually **generic** — a 6-line `globals.css` (GitHub-dark, default system font), a thin landing (title + 3 buttons), competent-but-flat cards. For the **CROO Agent Hackathon demo (HARD deadline 2026-07-09)** we want the demo-path pages to be *the best they can be* — a distinctive, cinematic presentation that makes "an autonomous agent hiring, paying, and QA-ing specialists on-chain" feel alive.

**This is a presentation-layer reskin.** No engine, money-path, SSE, reducer, or route logic changes. Zero risk to Door A behavior.

**Direction (RECTOR-approved):** **Cinematic mission-control** — the app as a live ops console. Landing uses a **cinematic hero + progressive-disclosure scroll** (chosen for UX: a cold judge gets the hook + CTA in ~5s above the fold, then scrolls for depth — how it works → two doors → on-chain proof → integrity gate).

## Scope

Hand-tuned demo path:
1. **Landing** — `app/(marketing)/page.tsx`
2. **Intake** — `app/intake/page.tsx`
3. **Theater (the hero)** — `app/run/live/page.tsx` + `app/run/[id]/page.tsx` and the `components/theater/*` tree (`Theater`, `BrainBar`, `Lane`, `MoneyLedger`, `ThinkingFeed`, `BasescanLink`)
4. **Kit** — `components/KitView.tsx` + `app/kit/[id]/page.tsx`

Inherit the design system for free (not hand-tuned this pass): `app/replay/[id]/page.tsx`, the landing "recent runs" list, `ReplayStage`. They must not look broken — they pick up the new tokens/base styles — but bespoke polish is out of scope.

**Out of scope:** new pages/features; engine/CAP/SSE/reducer logic; the marketing copy of README/BUIDL (already done); replay bespoke polish; a light theme (see below).

## Theme decision — deliberately dark-only

Mission-control is an inherently dark, neon console; a light mode would undermine the aesthetic. The app is already dark-committed (`color-scheme: dark`, `<html class="dark">`). We keep it **single dark theme by deliberate choice** (per design guidance: a design that commits to one visual world may stay single-theme). No `prefers-color-scheme`/`data-theme` light path is required.

## Design system — "Mission Control"

Implemented as design tokens (Tailwind theme extension + CSS variables in `globals.css`) plus a small set of reusable primitives. Every page/component consumes tokens — no ad-hoc hexes.

### Palette
| Token | Hex | Use |
|---|---|---|
| `ground` | `#05070c` | app background (cool near-black) |
| `panel` | `#0b0f18` | console panel surface |
| `panel-2` | `#111726` | raised/hover surface |
| `line` | `rgba(120,150,220,.14)` | hairline borders |
| `ink` | `#cdd6e4` | primary text |
| `muted` | `#7f8ba5` | secondary text / labels |
| `grid` | `rgba(90,140,255,.05)` | faint telemetry grid background |
| `research` | `#58a6ff` | research leg (blue) |
| `copy` | `#e3b341` | landing-copy leg (amber) |
| `image` | `#c297ff` | og-image leg (violet) |
| `live` | `#43e08a` | **system accent** — LIVE dot, spend meter, receipts, active/paid |
| `danger` | `#f85149` | blocked / rejected / over-cap |

Neon is delivered via color + `box-shadow` glow (e.g. `0 0 14px -4px <color>`), used on active/state-changed elements only — restraint keeps it from looking noisy.

### Typography
Loaded with **`next/font`** (self-hosted, no CDN — Vercel-safe), exposed as CSS variables and wired into Tailwind `fontFamily`:
- **Display / headings / body:** **Geist** (`geist/font/sans`) — a technical grotesque. Tight tracking on large sizes, `text-wrap: balance` on headings.
- **Data / labels / logs / meters / phase readouts:** **Geist Mono** (`geist/font/mono`). Mono is core to the console feel; use `font-variant-numeric: tabular-nums` for all aligned digits (spend, prices).

Type scale (rem): 0.75 / 0.8125 / 0.875 / 1 / 1.25 / 1.75 / 2.5 / 3.5. Uppercase mono labels get `letter-spacing: .06em`.

### Motion
CSS keyframes + Tailwind utilities. **All motion inside `@media (prefers-reduced-motion: no-preference)`** (off by default for reduced-motion users):
- `pulse` — LIVE dot (1.4s).
- `sweep` — spend-meter shimmer while a run is active.
- lane **glow transition** on phase change (border/shadow ease).
- thinking-log **ticker** (new lines fade/slide in).
- receipt-chip **pop** when a payment lands.
- landing hero: a subtle ambient loop on the Theater-preview + a load-in reveal.

### Structure / components (isolation)
New shared primitives in `components/ui/` (each one job, token-driven, testable):
- `ConsolePanel` — the framed neon-dark surface (border, optional glow, header slot).
- `StatusPill` — phase/mode/status chip (variant → color).
- `LiveDot` — pulsing presence indicator.
- `SpendMeter` — labeled progress bar with tabular amount (reused by MoneyLedger + landing hero + Theater).
- `PhaseRail` — extracted from `Lane` (segmented progress rail).
- `ReceiptChip` — Basescan receipt link styled as an on-chain receipt (wraps/upgrades `BasescanLink`).
- `GridBackdrop` — the telemetry-grid background layer.

Each demo page/component is reskinned to consume tokens + primitives while **preserving its props, data flow, and behavior** (the SSE hooks, reducer, and route handlers are untouched).

## Per-page treatment

- **Landing** — cinematic hero: `GridBackdrop`, an **ambient Theater-preview** (3 glowing lanes + `SpendMeter` + `LiveDot`) that is **decorative/canned** — a small `"use client"` island looping scripted phase states, **NOT** a real SSE run (no engine, no network, no spend). Headline + subcopy + primary/secondary CTAs. The existing server-fetched "recent runs" data flow (`listRecords`) is preserved, only restyled. Then progressive-disclosure scroll sections in the same palette: **what it does** → **two doors** (A: human app / B: CAP seller — registered + on-chain proven + gated) → **on-chain proof** (real txHashes, Basescan) → **the integrity gate** (rejects a job it can't staff — the differentiator) → CTA. "Recent runs" list restyled as console rows.
- **Intake** — a "mission briefing" console: `ConsolePanel` with the single brief field framed as issuing a launch order; mode (sandbox/live) shown as a `StatusPill` readout; live-mode token note as a console hint.
- **Theater (hero)** — full console. `BrainBar` → a status header (current phase, elapsed, mode). Lanes → glowing telemetry `ConsolePanel`s with `PhaseRail`, agent, and `ReceiptChip` on payment; lane color per leg; glow on state change. `MoneyLedger` → a ticking spend console using `SpendMeter` + tabular amounts + per-hire rows. `ThinkingFeed` → a live mono log stream with the ticker animation.
- **Kit** — "mission complete" debrief. Asset sections as `ConsolePanel` cards (OG image / short pitch / landing copy / tweet thread / PH-HN / README). Provenance cards as prominent on-chain **receipts** (`agent · $cost · contentHash · Basescan`) via `ReceiptChip`. Keep copy-to-clipboard + download-JSON affordances, restyled.

## Accessibility & quality
- Visible keyboard focus ring on every interactive element (a `live`-tinted outline).
- `prefers-reduced-motion` disables all animation (static neon still reads).
- Contrast: verify `ink`/`muted` on `ground`/`panel` meet AA for body; neon accents used for accents/large text, not small body copy.
- No layout shift from motion; wide content (logs, code) scrolls within its own container, page never scrolls sideways.

## Constraints & risks
- **Behavior-preserving.** SSE lifecycle, reducer, route handlers, engine, money guards: untouched. If a reskin changes a component's DOM/classes that a test asserts on, **update the test to match new structure while preserving intent** — the suite must stay green.
- **Fonts:** add the `geist` package (Vercel's, MIT) via `next/font`; self-hosted, no runtime CDN. No other deps unless justified.
- **Tailwind/shadcn:** extend the existing Tailwind config; keep `cn`/utility conventions. shadcn is barely used today — we add primitives directly rather than pulling the full shadcn theme.

## Testing & verification
- `pnpm test:run` green (update Theater/KitView/page tests only where markup they assert changed; preserve intent).
- `pnpm typecheck` + `pnpm exec next build` clean.
- Drive Door A locally (`pnpm dev:web`) + one sandbox run to confirm the Theater still streams and the kit renders — the reskin must not regress the live flow.
- Deploy preview (Vercel) sanity before merge.

## Success criteria
1. Landing, intake, Theater, and kit render in the cohesive mission-control language (palette, Geist + mono, motion), demonstrably distinct from the current generic look.
2. Landing tells the progressive-disclosure story (hook → what → two doors → on-chain proof → integrity gate).
3. Door A functionality intact (SSE stream, replay, kit, download/copy).
4. Tests green, typecheck clean, next build clean, Vercel deploy healthy.
5. Delivered within the time-box, leaving ≥3 days for the demo video + BUIDL.

## Non-goals
Engine/CAP/SSE/reducer/money logic; new pages or features; a light theme; bespoke polish of replay/run-list; README/BUIDL copy (done); real clean-3/3 provenance (supply-blocked — separate track).

## Time-box
~1.5–2 focused days: (1) design-system foundation (tokens, fonts, primitives, motion), (2) landing, (3) Theater, (4) intake + kit, (5) verify + deploy. Then hand to the demo/BUIDL session.

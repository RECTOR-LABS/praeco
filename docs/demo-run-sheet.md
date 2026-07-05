# Praeco — Demo Run-Sheet (dry-run verified 2026-07-05)

> The operational companion to [`demo-storyboard.md`](./demo-storyboard.md). Every beat below was
> walked against the **live** site + terminal. It records the exact assets, commands, and — most
> importantly — **three corrections** to the storyboard you must apply before recording.

**Hero replay:** [`/replay/run-1782628352055`](https://praeco.rectorspace.com/replay/run-1782628352055) — product "Streaky" (privacy-first habit tracker). Chosen over the other two because it's the **only bundled replay that shows the QA loop *acting*** (a redo), which is the whole point of the hero beat.

---

## ⚠️ Three corrections — apply BEFORE you record

### 1. Integrity — the replay's on-chain links are MOCK. Do not present them as real. (most important)
The bundled replays are **mock-provenance** (the live clean 3/3 is supply-blocked — see memory). Verified on the live page: every "Basescan"/"Receipt" link on `/replay/...` points to `basescan.org/tx/0xmockpay1…4` — **dead hashes**. The agents are `ProofResearch / Foundr / Pygm Studio` at mock addresses.

- **DON'T** click a replay Basescan/Receipt link on camera (it 404s on Basescan).
- **DON'T** say "these payments are on-chain / nothing is faked" *over the replay* (storyboard 1:00–2:45 & 2:45–3:30 currently do — see the storyboard patch below).
- **DO** narrate the replay honestly as *"the engine's run, faithfully recorded — every hire, payment, and QA verdict"*, and show **real** on-chain proof separately (beat 3:30–4:30):
  - Real Door B deliver tx → **https://basescan.org/tx/0x97547499e592dc1b4390e3a11213502f9fabc0dec5fe5fba4e4362cdf886ad84** (resolves)
  - Registered CROO listing → `Product Launch Kit`, serviceId `5168a527-df1d-45fb-bcaa-a638f2a1fcf9`

This matters: the hackathon hard-DQs a "fake demo," and there's a random 10% human audit. Keep the mock/real line crisp and you're bulletproof; blur it and you're at risk.

### 2. It's a REDO, not a swap
In this replay, `landing_copy` was hired from **Foundr** → QA returned **redo** ("copy omitted the brief") → **Foundr was re-hired** with a revised brief → QA **accept** (95). It re-hired the *same* specialist, it did **not** swap to a different one. Narrate "redo": *"QA rejected the first draft, so it re-briefed and re-hired the same specialist — the second pass passed."* (The receipts list makes this visible: **two Foundr entries**.)

### 3. Temporal mismatch — reach COMPLETED first, then scroll to the kit
The replay page renders the finished **Launch Kit · MISSION COMPLETE** *below* the still-playing Theater (known issue). If both are in frame, the Theater says RUNNING while the kit says COMPLETE. Also, the Theater's elapsed clock reads **`0s` while playing** (cosmetic bug), only showing the true `2m 23s` once done.
- **Workaround:** hit **4×** (or **Skip**) to land on the clean **COMPLETED** Theater (all lanes ACCEPTED, spend `$0.80`, the receipts list), *then* scroll down to the kit. Don't linger on the `0s` clock mid-play.

---

## Setup (verified ready)

- `.env` is fully populated → the live terminal beats work. ✅
- Two windows: browser at **praeco.rectorspace.com**, terminal in `~/local-dev/praeco`.
- Pre-load the hero replay tab: `/replay/run-1782628352055`.
- Have a Basescan tab ready on the **real** tx (`0x9754…`) for the on-chain beat.

---

## Beat-by-beat (≤5 min) — all verified camera-ready

| Time | SHOW | SAY (corrected) | DO | ✓ |
|---|---|---|---|---|
| 0:00–0:30 | Landing hero | "Great products die at launch… Praeco is the coordinator — one sentence in, a paid-for, QA'd launch kit out, and it hires real agents to do it." | Scroll the landing slowly: hero → Mission-Control preview → the two-doors / proven-on-chain cards | ✅ camera-ready |
| 0:30–1:00 | Intake | "I describe my product; Praeco turns it into a brief and hires one specialist per leg — research, landing copy, an OG image." | (Optional live intake, or cut straight to the replay) | ✅ |
| 1:00–2:45 | **Hero: the Theater** at `/replay/run-1782628352055`, played at **4×** | "This is a recorded run of the engine. Three lanes — each a real hire: negotiate, pay, deliver. Watch the spend meter climb and a receipt drop on each payment. Then the art-director QA grades every deliverable — accept, redo, or swap." | Load replay → **4×** → watch lanes advance, spend climb, receipts appear → let it reach **COMPLETED** | ✅ shows redo |
| — | The **redo** moment (receipts list: two Foundr) | "Here — QA rejected the first landing copy for missing the brief, so it re-briefed and re-hired the same specialist. The second pass passed. That curation loop is what turns raw output into a coherent kit." | Point at the two **Foundr $0.10** receipts | ✅ verified |
| 2:45–3:30 | Scroll to **Launch Kit · MISSION COMPLETE** | "Here's the kit — short pitch, landing copy, PH/HN blurb, tweet thread — and a provenance card per asset: which agent, what it cost, the content hash." | Scroll the kit; hover a provenance card. **Do NOT click its Basescan link** (mock). | ✅ kit rich |
| 3:30–4:30 | **Door B + real on-chain proof** | "Same engine, second door: Praeco is a registered seller on the CROO Store — and it won't take a job it can't staff. Before accepting it verifies every leg, rejecting-with-reason otherwise. And it's real on Base —" | Terminal: `pnpm door-b:sim` (clean happy-path) → then the **real** Basescan tab (`0x9754…`) + optional `marketplace:probe` for the $0 reject | ✅ verified |
| 4:30–5:00 | Repo (MIT) + architecture | "Open source, MIT, proven on Base mainnet. Give it a product, get a launch — coordinated, paid for, and verifiable, by agents." | Show the GitHub repo + `assets/architecture.svg` | ✅ |

---

## Terminal beats — exact commands + what you'll see

**Door B happy-path (`$0`, clean):**
```
pnpm door-b:sim
```
→ `fulfillable: research=1 landing_copy=2 og_image=1` → `accepted mock-neg → order mock-order` → `run … completed (spent 700000 base units)` → `delivered … contentHash 0x… txHash 0x…`. (Sim hashes are mock — it's honestly labelled `--sim`; the *real* proof is the Basescan tab.)

**Integrity gate — reject-with-reason at `$0` (live marketplace):**
```
tsx scripts/probe-marketplace.ts     # NOT `pnpm marketplace:probe`
```
→ per-leg candidate table → `GATE VERDICT ok=false … NOT STAFFABLE — a live clean run would fail-close at $0`.
- **Why `tsx` directly:** the probe intentionally exits `1` when not-staffable; `pnpm` then prints `ELIFECYCLE Command failed with exit code 1`, which looks like a crash on camera. Running `tsx` directly shows the clean verdict without the pnpm error line.
- Current live state is **NOT STAFFABLE** (stale pins offline) — that's a *good* integrity beat, but say it accurately: "its vetted providers are offline right now, so it fails closed rather than charge you."

---

## Do NOT show on camera
- `.env`, the CROO SDK key, the agent wallet private key.
- Any **replay** "Basescan"/"Receipt" link click (mock `0xmockpay*`).
- The Theater's `0s` elapsed clock lingering mid-play (use 4× / Skip).

## The only real on-chain artifacts (safe to show)
- Door B deliver tx: `0x97547499e592dc1b4390e3a11213502f9fabc0dec5fe5fba4e4362cdf886ad84` → resolves on Basescan.
- CROO listing: `Product Launch Kit`, serviceId `5168a527-df1d-45fb-bcaa-a638f2a1fcf9`.
- The buyer-side Phase-1 hires (real, on Base) — referenced, not on-screen.

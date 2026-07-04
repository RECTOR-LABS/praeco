# Praeco — Demo Video Storyboard (≤ 5 min)

> Shot list + narration for the hackathon demo. Drive the live app for the hero moment; use a clean replay so the run is fast and deterministic. Keep the on-screen wallet/keys out of frame.

**Setup before recording**
- Open [praeco.rectorspace.com](https://praeco.rectorspace.com) and a terminal in `~/local-dev/praeco`.
- Have one **clean replay** ready (fast, resolves cleanly) for the "watch it think" segment so you don't wait on a live run.
- For Door B, use `pnpm door-b:sim` for a deterministic `$0` walkthrough (the service is **registered live** on CROO; real fulfillment via `door-b:fulfill` spends USDC). Optionally have `pnpm marketplace:probe` ready to show the `$0` fulfillability gate.

---

### 0:00 – 0:30 — Hook (the thesis)

- **Show:** the landing page.
- **Say:** "Great products die at launch. Positioning, copy, an OG image, the Product Hunt and Twitter posts — a dozen specialist jobs nobody has time to coordinate. Praeco is the coordinator. One sentence in; a paid-for, QA'd launch kit out — and it hires real agents to do it, on-chain."

### 0:30 – 1:00 — Intake

- **Show:** type a one-liner (or paste a GitHub repo) into the single intake field. Submit.
- **Say:** "I describe my product. Praeco turns that into a brief and starts assembling a launch kit — hiring one specialist per leg: research, landing copy, and an OG image."

### 1:00 – 2:45 — The Theater (the hero shot)

- **Show:** the live Theater — three lanes advancing through `search → candidate → negotiating → paid → delivered → QA verdict → submitted`. Point at the **spend meter** ticking up, a **receipt chip** appearing on payment, and a **QA `swap`/`redo`** rendering as a visible state change.
- **Say:** "This is the run, live. Each lane is a real hire on the CROO marketplace. It negotiates, pays in USDC on Base — there's the receipt — then an art-director QA pass grades the work: accept, redo, or swap. When QA says swap, it hires a different provider. Nothing here is faked; the payments are on-chain."

### 2:45 – 3:30 — The finished kit + provenance

- **Show:** the Finished Kit screen — landing copy, OG image, tweet thread, pitch, PH/HN blurb. Open a **provenance card** and click through to **Basescan**.
- **Say:** "Here's the kit — copy, image, the announcement posts. And every asset carries a provenance card: which agent made it, what it cost, the content hash, and a Basescan link. The replay *is* the audit trail."

### 3:30 – 4:30 — Door B: Praeco is callable

- **Show:** the terminal — `pnpm door-b:fulfill` (or `door-b:sim`). Walk the log: `fulfillability check → accepted → waiting for payment → run → delivered (contentHash)`. Optional cutaway: `pnpm marketplace:probe` rejecting at `$0` when a leg is unstaffable.
- **Say:** "The same engine has a second door: Praeco is **listed as a seller on the CROO Agent Store** — an agent can order a launch kit. And it won't take a job it can't do: *before accepting*, it verifies it can staff every leg, and rejects-with-reason otherwise — so it never charges for a kit it can't deliver. Once it's clear to proceed, it accepts, waits for the buyer to pay, runs the exact same engine, and delivers the kit with a content hash. Two doors, one engine — Praeco both buys from the marketplace and sells into it."

### 4:30 – 5:00 — Close

- **Show:** the repo (MIT) + the architecture diagram.
- **Say:** "It's open source, MIT, and proven on Base mainnet. Praeco: give it a product, get a launch — coordinated, paid for, and verifiable, by agents."

---

**B-roll / cutaways if short on time:** the architecture diagram (`assets/architecture.svg`), a scrolling `RunRecord` JSON, the spend meter close-up.

**Do NOT show on screen:** the spendable CROO key, the agent wallet private key, any `.env` contents.

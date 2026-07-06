# Praeco — Demo Video Storyboard (≤ 5 min)

> Shot list + narration for the hackathon demo. Drive the live app for the hero moment; use a clean replay so the run is fast and deterministic. Keep the on-screen wallet/keys out of frame.
>
> **Read the verified [run-sheet](./demo-run-sheet.md) alongside this** — it has the exact assets, commands, and camera workarounds.
>
> **Integrity rule (important):** the bundled replays are **mock-provenance** (the live clean 3/3 is supply-blocked). Narrate a replay as *"a recorded run of the engine,"* and show **real** on-chain proof only from the actual Door B settlement tx (beat 3:30–4:30). **Never click a replay's Basescan link on camera or call it a real settlement** — those hashes are mock, and the hackathon hard-DQs a faked demo.

**Setup before recording**
- Open [praeco.rectorspace.com](https://praeco.rectorspace.com) and a terminal in `~/local-dev/praeco`.
- Hero replay = **[`/replay/run-1782628352055`](https://praeco.rectorspace.com/replay/run-1782628352055)** ("Streaky") — the one bundled replay that shows the QA loop *acting* (a landing-copy redo).
- Keep a browser tab ready on the **real** Door B settlement: [`0x9754…`](https://basescan.org/tx/0x97547499e592dc1b4390e3a11213502f9fabc0dec5fe5fba4e4362cdf886ad84).
- For Door B, use `pnpm door-b:sim` for a deterministic `$0` walkthrough (the service is **registered live** on CROO; real fulfillment via `door-b:fulfill` spends USDC). For the fulfillability gate, run `tsx scripts/probe-marketplace.ts` directly (not `pnpm marketplace:probe`, which appends an `ELIFECYCLE` error line on the intentional exit-1).

---

### 0:00 – 0:30 — Hook (the thesis)

- **Show:** the landing page.
- **Say:** "Great products die at launch. Positioning, copy, an OG image, the Product Hunt and Twitter posts — a dozen specialist jobs nobody has time to coordinate. Praeco is the coordinator. One sentence in; a paid-for, QA'd launch kit out — and it hires real agents to do it, on-chain."

### 0:30 – 1:00 — Intake

- **Show:** type a one-liner (or paste a GitHub repo) into the single intake field. Submit.
- **Say:** "I describe my product. Praeco turns that into a brief and starts assembling a launch kit — hiring one specialist per leg: research, landing copy, and an OG image."

### 1:00 – 2:45 — The Theater (the hero shot)

- **Show:** the Theater, **played at 4× until it reaches `COMPLETED`** — three lanes advancing through `search → candidate → negotiating → paid → delivered → QA verdict → submitted`. Point at the **spend meter** climbing, a **receipt** dropping on each payment, and the **QA redo** — the `ON-CHAIN RECEIPTS` list shows the landing-copy specialist (Foundr) hired **twice**. (Reach `COMPLETED` before scrolling to the kit — the page shows the finished kit below the still-playing Theater otherwise. See run-sheet.)
- **Say:** "This is a recorded run of the engine. Each lane is a real hire on the CROO marketplace — it negotiates, pays in USDC on Base, and takes delivery; a receipt drops on every payment. Then an art-director QA pass grades each deliverable: accept, redo, or swap. Here QA rejected the first landing copy for missing the brief — so it re-briefed and re-hired the same specialist, and the second pass passed. That curation loop is what turns raw marketplace output into a coherent kit."

### 2:45 – 3:30 — The finished kit + provenance

- **Show:** the Finished Kit screen — landing copy, OG-image reference, tweet thread, pitch, PH/HN blurb. Open a **provenance card** (agent · cost · content hash). **Don't click the replay's Basescan link — it's a mock hash;** the real settlement comes in the next beat.
- **Say:** "Here's the kit — copy, image, the announcement posts. Every asset carries a provenance card: which agent made it, what it cost, and its content hash. The replay *is* the audit trail — and in a moment I'll show you a real order settled on Base."

### 3:30 – 4:40 — Door B: the real, on-chain hero

- **Show:** the terminal — **`pnpm door-b:verify`** (`$0`, read-only). It prints two blocks: the **live listing** pulled from the *public* CROO API (`Praeco` · `Product Launch Kit` · `5168a527…` · `$2`) and the **real settled order** on Base mainnet (`order 35673686… → paid → delivered`, `deliver tx 0x9754…`, `contentHash`, `confirmed in block 48178130`). Then **`pnpm exec tsx scripts/probe-marketplace.ts`** — the live `$0` integrity reject. Then cut to the **real** Basescan tab [`0x9754…`](https://basescan.org/tx/0x97547499e592dc1b4390e3a11213502f9fabc0dec5fe5fba4e4362cdf886ad84) for the decoded USDC settlement. *(Optional: `pnpm door-b:sim` for the accept→pay→run→deliver flow shape.)*
- **Say:** "The same engine has a second door — and this part's real. Praeco isn't just a demo; it's a **registered seller on the CROO store**. Watch — this listing is live right now, you can verify it yourself, and here's an actual order it fulfilled: paid and delivered on Base mainnet, confirmed in a block. And it's honest about what it can do: before it takes a job it checks it can staff every leg, and if it can't — like right now, its providers are offline — it just rejects at zero cost instead of charging you. Two doors, one engine: Praeco both buys from the marketplace and sells into it, for real, on-chain."

### 4:30 – 5:00 — Close

- **Show:** the repo (MIT) + the architecture diagram.
- **Say:** "It's open source, MIT, and proven on Base mainnet. Praeco: give it a product, get a launch — coordinated, paid for, and verifiable, by agents."

---

**B-roll / cutaways if short on time:** the architecture diagram (`assets/architecture.svg`), a scrolling `RunRecord` JSON, the spend meter close-up.

**Do NOT show on screen:** the spendable CROO key, the agent wallet private key, any `.env` contents.

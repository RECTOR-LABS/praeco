# Praeco — DoraHacks Filing Sheet (paste-ready)

> Operational sheet for filing the BUIDL on DoraHacks. Every field below is copy-paste ready.
> Once the demo video URL exists, filing is a ~5-minute mechanical step.
> Long-form narrative lives in [`BUIDL.md`](./BUIDL.md); this sheet maps it onto the form fields.

**Where:** https://dorahacks.io/hackathon/croo-hackathon → **Submit BUIDL** (or create the BUIDL first, then submit it to the hackathon).

---

## ⚠️ Preflight — verify before you file

| # | Check | Status | Note |
|---|---|---|---|
| — | **Deadline** | **2026/07/12 16:00** | Confirmed live on the DoraHacks page (06-26). The "2026-07-09" in recent handoffs was a **self-imposed buffer**, not the real cutoff. **Re-confirm the countdown on the live page before relying on it** — organizers can extend/shorten. |
| — | Repo **PUBLIC** | ✅ verified | `RECTOR-LABS/praeco` visibility = PUBLIC (checked this session). Private repo = **hard DQ**. |
| — | **MIT** license | ✅ verified | `LICENSE` present, `licenseInfo.key = mit`. |
| — | README (setup + SDK methods + integration) | ✅ verified | Setup, integration notes, the two-door architecture, **and** an explicit "CAP integration — SDK methods used" section enumerating the concrete `@croo-network/sdk` calls (buyer + seller). Req #4 fully covered. |
| — | **Demo video (≤5 min)** | ⧗ **the one blocker** | Record per `docs/demo-storyboard.md`, upload (YouTube/Loom **unlisted** is fine), then drop the URL into the **Video** field below + `BUIDL.md` line ~55. |

### The 5 hard requirements (all mandatory)

1. **Listed on CROO Agent Store** — ✅ `Product Launch Kit`, serviceId `5168a527-df1d-45fb-bcaa-a638f2a1fcf9`.
2. **Integrated with CAP — callable, settles on-chain** — ✅ buyer + seller both proven on Base mainnet.
3. **Open source, permissive license** — ✅ MIT, public repo.
4. **Demo (≤5-min video) + README** — README ✅ (setup + integration + explicit SDK-methods section) · video ⧗ (record + link).
5. **BUIDL filed on DoraHacks** — ⧗ this sheet.

### README hardening — ✅ DONE

Req #4's "**SDK methods used**" is now covered: the README has an explicit **"CAP integration — SDK methods used"** section enumerating the concrete `@croo-network/sdk` calls — buyer (`listServices`/`listAgents`/`getAgent`, `negotiateOrder → getNegotiation`/`listOrders`/`getOrder → payOrder`) and seller (`listNegotiations → acceptNegotiation`(`/WithFundAddress`)/`rejectNegotiation → getOrder → deliverOrder`) — plus the Pi-SDK money-guarded toolbelt. Method names pulled from `src/cap/`.

---

## Field-by-field (paste-ready)

### Hackathon
`CROO Agent Hackathon` — https://dorahacks.io/hackathon/croo-hackathon

### Track(s) — max 2 per BUIDL
- **Primary:** `Creator & Content Ops` — our wedge (was the empty track; a launch-kit composer is a native fit).
- **Optional 2nd:** `Open – Any A2A` — Praeco is a two-sided A2A participant (buys *and* sells on CAP). Add only if a 2nd track is allowed and helps.

### Name
- **Primary:** `Praeco`  *(6 chars)*
- **If a longer name reads better:** `Praeco — Autonomous Launch-Kit Composer`  *(39 chars)*

### Logo
- `assets/praeco-avatar.png`  *(square raster — DoraHacks logo upload wants PNG/JPG)*
- Vector source if needed: `assets/praeco-avatar.svg`

### Cover / screenshots (media gallery)
- **Best cover:** a fresh **16:9 screenshot of the live landing hero** at https://praeco.rectorspace.com (crop keys/wallet out of frame).
- **Also strong:** the architecture diagram — export `assets/architecture.svg` → PNG (DoraHacks galleries prefer PNG/JPG over SVG).
- Optional extra frames: the Theater mid-run + a finished-kit provenance card.

### Tagline / Intro (one-liner)
Pick the **longest variant that fits** once the form shows its character counter. Default recommendation: the **132-char** line.

| Chars | Text |
|------:|------|
| 178 | An autonomous general contractor for product launches — it hires, pays, and QA's real specialist agents on CROO, then hands you a ready-to-post launch kit with on-chain receipts. |
| 172 | Autonomous general contractor for product launches: it hires, pays, and QA's real specialist agents on CROO, then returns a ready-to-post launch kit with on-chain receipts. |
| **132** | **Give Praeco one sentence; it hires, pays, and QA's real CROO agents, then returns a ready-to-post launch kit with on-chain receipts.** |
| 101 | One sentence in — a paid-for, QA'd, on-chain-verifiable product launch kit out, built by real agents. |
| 78 | One sentence in, a paid-for, QA'd, on-chain-verifiable product launch kit out. |

### Tags
Add in priority order until the tag cap (usually ~5) is hit:
`AI Agents` · `A2A` · `Web3` · `Base` · `USDC` · `CAP` · `Content Ops` · `Creator Tools`
*(First five align with the hackathon's own tags + our stack; the last three sharpen the Creator & Content Ops fit.)*

### Description (long / rich text)
Paste the body of [`BUIDL.md`](./BUIDL.md) — **everything from `## The problem` through `## What's next`.** It's written in submission-ready markdown; paste as-is and confirm headings/lists render (use the editor toolbar if the field is WYSIWYG-only). Include the **on-chain verification block** below near the end so judges can verify without leaving the page.

> Skip the file's top `# Praeco — DoraHacks BUIDL` H1 and the `## Tagline` / `## Links` sections — those map to the dedicated Name / Intro / URL fields above.

### Links (one URL per blank)
| Field | Value |
|---|---|
| **Video** | ⧗ *(add once recorded)* |
| **Website / live demo** | `https://praeco.rectorspace.com` |
| **Source code / GitHub** | `https://github.com/RECTOR-LABS/praeco` |

---

## On-chain verification block (for the description / judges)

> Everything below is public on-chain data — safe to publish, and checkable.

- **CROO seller listing:** `Product Launch Kit` — serviceId `5168a527-df1d-45fb-bcaa-a638f2a1fcf9`
- **Seller order lifecycle (real, on-chain):** order `35673686-c363-45d2-b4ce-fdfb22a380fe` → `paid` → `deliver`
  - deliver txHash: `0x97547499e592dc1b4390e3a11213502f9fabc0dec5fe5fba4e4362cdf886ad84`
  - contentHash: `0xfa2bd434494d1d49daa35c925230587feee9ed6197559381496ab9bc3c14fc6c`
  - Basescan: https://basescan.org/tx/0x97547499e592dc1b4390e3a11213502f9fabc0dec5fe5fba4e4362cdf886ad84
- **Buyer side:** autonomous hires across independent counterparty agents on Base mainnet (Phase-1), each negotiated, paid in USDC, and delivered with receipts.

**Precision (do not overclaim):** the *seller* order above proves the full **lifecycle + money-invariant** on-chain (order → paid → deliver with a committed `contentHash`); the **multi-agent hiring/composition** proof is the **buyer** side. The live clean 3/3-leg kit remains **supply-blocked** on CROO (no in-budget inline-image provider / copywriter yet) — don't claim a full 3-leg kit was composed on that specific seller order.

---

## Reward-eligibility (anti-sybil) — awareness, not a submission blocker

Filing is valid regardless; these flags affect **reward** eligibility:

- **≥3 unique counterparty agents** — ✅ cleared **by design** (every run hires 3 specialists).
- **≥5 unique buyer wallets** — ⧗ RECTOR's audience supplies these (post-filing push).
- **No concentrated self-trade** — keep real orders coming from distinct wallets, not one.
- **Random 10% human audit** — the replay *is* the audit trail; nothing is faked.
- Onboarding rewards capped at 3 agents per team/wallet cluster; appeals window 48h.

---

## Filing checklist (do in order)

1. [ ] Record the demo video (≤5 min) → upload → copy URL.
2. [ ] Add the video URL to `BUIDL.md` (line ~55) and to the **Video** field above; commit.
3. [ ] Re-confirm the deadline countdown on the live DoraHacks page.
4. [ ] DoraHacks → CROO Agent Hackathon → **Submit BUIDL**.
5. [ ] Fill: Name · Logo · Cover · Tagline (longest that fits) · Tags · Description (BUIDL.md body + on-chain block) · Video · Website · GitHub.
6. [ ] Select track(s): **Creator & Content Ops** (+ optional Open – Any A2A).
7. [ ] Preview → confirm markdown renders, all 3 URLs resolve, images load.
8. [ ] **Submit.** Screenshot the confirmation.

### Post-filing
- [ ] Announce for **≥5 buyer wallets** (RECTOR Academy / X / Discord) — reward-eligibility.
- [ ] Update the handoff / memory: BUIDL filed (+ its DoraHacks URL).

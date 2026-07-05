# Praeco — Demo Video + `/pitch` Judge Page (design)

**Date:** 2026-07-06
**Status:** approved (design), pending spec review
**Author:** RECTOR + CIPHER
**Context:** The DoraHacks BUIDL is fully staged (`docs/BUIDL-submission.md`); the *only* remaining
submission blocker is the ≤5-min demo video. This spec covers producing that video (dev-humble
AI-narrated, screen-first, chunked), self-hosting it, embedding it on a judge-facing `/pitch`
page, and filing. **Hard deadline: 2026-07-12 16:00.**

---

## 1. Goal & success criteria

Ship the last blocker and file.

**Done when:**
- A **≤5-min** demo video exists, narrated in a **dev-humble, first-person, male** voice (ElevenLabs).
- The video is **self-hosted** (Vercel Blob) and **embedded on `praeco.rectorspace.com/pitch`**.
- `/pitch` stands alone for a judge: pitch brief + video + **real** on-chain proof + CTAs.
- The **mock/real integrity line is never blurred** (the replay is "a recorded run"; the only
  real settlement shown is the Door B tx `0x9754…`).
- The **BUIDL is filed** on DoraHacks before 2026-07-12 16:00.

**Non-goals (YAGNI):** live clean 3/3 (supply-blocked — do not force); ≥5 buyer wallets
(post-filing, lower priority); any engine/money code change; background music (dry read by default).

---

## 2. Narration script (dev-humble, first-person, male)

Source of truth = the **corrected** content in `docs/demo-run-sheet.md` (which supersedes the
storyboard where they differ). Register approved on beats 1 & 3; all six below are drafts.

**Elastic-copy rule:** because we record screen-first, the *exact* wording of each beat is
finalized **after** the chunk is recorded, sized to its measured duration. The text below is the
target; I trim/extend to fit so the voice matches the video (never the reverse).

**Integrity rules baked into the copy:**
- The replay is narrated as *"a recorded run of the engine,"* never "on-chain / real settlement."
- Real proof appears **only** in beat 5 (Door B tx `0x9754…` + serviceId `5168a527…`).
- Nothing on the do-NOT-show list is ever referenced in a way that invites clicking it.

### Beat 1 — Hook (0:00–0:30) · SHOW: landing hero, slow scroll
> "So, you know how a lot of good products kinda just… die at launch? There's positioning, the
> copy, an OG image, the Product Hunt post, the tweet thread — it's like a dozen little specialist
> jobs, and honestly nobody has time to coordinate all that. That's basically why I built Praeco.
> You give it one sentence about your product, and it goes and hires *real* agents to do each piece
> — pays them, checks their work — and hands you back a launch kit. On-chain, for real."

### Beat 2 — Intake (0:30–1:00) · SHOW: the single intake field, submit
> "So here's the whole input — just one field. I describe my product, or paste a GitHub repo, and
> that's it. Praeco takes that one sentence, turns it into a proper brief, and then hires one
> specialist per piece — someone for research, someone for the landing copy, someone for the OG
> image. I don't pick the agents or babysit it; it just goes."

### Beat 3 — The Theater / hero (1:00–2:45) · SHOW: `/replay/run-1782628352055` at 4× → COMPLETED
> "Okay so this is an actual run of the engine — just recorded so it's quick. Each of these three
> lanes is a real hire on the CROO marketplace. Praeco negotiates, pays in USDC on Base, takes
> delivery — and you get a receipt every time it pays. Then there's this little art-director QA step
> that grades each thing: accept, redo, or swap. And check this — here QA didn't like the first
> landing copy, said it missed the brief, so it just re-briefed and re-hired the *same* agent, and
> the second pass was good. That back-and-forth is kinda the whole point — it's what turns a pile of
> raw marketplace output into something that actually holds together."
>
> *(Camera: reach COMPLETED before scrolling. Point at the two Foundr $0.10 receipts for the redo.)*

### Beat 4 — Finished kit + provenance (2:45–3:30) · SHOW: scroll to Launch Kit, hover a provenance card
> "And this is what you actually get back — the kit. A short pitch, the landing copy, a Product Hunt
> and Hacker News blurb, a tweet thread. And every asset carries this little provenance card — which
> agent made it, what it cost, its content hash. So it's not a black box. This recorded run is
> basically the audit trail — and in a sec I'll show you a real one that settled on Base."
>
> *(Camera: do NOT click the provenance card's Basescan link — mock hash.)*

### Beat 5 — Door B + real on-chain proof (3:30–4:30) · SHOW: `pnpm door-b:sim`, then real Basescan tab, optional probe
> "Okay, second door — same engine, other direction. Praeco's also listed as a seller on the CROO
> store, so another agent can just order a launch kit from it. And here's the part I care about most:
> it won't take a job it can't actually do. Before it accepts, it checks it can staff every leg — and
> if it can't, it rejects with a reason instead of taking your money. Let me show both. This first run
> is the happy path — accepts, waits for payment, runs the engine, delivers with a content hash. And
> this one — its providers are offline right now, so watch, it just fails closed at zero cost rather
> than charge you for something it can't deliver. And it's real on Base mainnet — here's the actual
> settlement transaction. Two doors, one engine: Praeco buys from the marketplace and sells into it."
>
> *(Densest beat; copy is elastic — trim live to fit. Real tx: `0x9754…`. Probe cmd: `pnpm exec tsx scripts/probe-marketplace.ts`.)*

### Beat 6 — Close (4:30–5:00) · SHOW: GitHub repo (MIT) + `assets/architecture.svg`
> "That's Praeco. It's open source, MIT, and it's proven on Base mainnet — not a mockup. The idea's
> pretty simple honestly: you give it a product, you get a launch back — coordinated, paid for, and
> verifiable, all by agents. Thanks for watching."

---

## 3. Voice + audio pipeline (ElevenLabs)

- **Audition first (impl step 1, cheap):** install `elevenlabs/skills`; render *one* test line across
  ~4 male voices capable of a casual register; RECTOR picks by ear. Store the chosen `voice_id`.
- **Models:** `eleven_flash_v2_5` for the throwaway audition (cheapest); `eleven_multilingual_v2`
  for final renders (richest). Character-billed; total well within a normal plan.
- **Per-chunk generation (screen-first fit):**
  1. RECTOR records a chunk → drops it in `video/raw/`.
  2. I measure duration with `ffprobe`.
  3. I finalize that beat's wording to fit → generate via ElevenLabs → `video/audio/beatN.mp3`.
  4. Fit correction: pad with silence, or nudge tempo **≤±8%** (`atempo`, imperceptible) — never
     hard time-stretch.
- **Working dir `video/` is git-ignored** (raw takes, mp3s, intermediate mp4s never committed).

---

## 4. Recording protocol (screen-first, chunked) — CIPHER guides RECTOR

- **Shot card per chunk:** exact SHOW actions (from the run-sheet), a target duration, and the
  **do-NOT-show list** (`.env`, CROO SDK key, agent wallet key, any replay Basescan/Receipt link,
  the Theater's `0s` elapsed clock — use 4×/Skip).
- **Capture:** macOS **Cmd+Shift+5** (or QuickTime) → one `.mov`/`.mp4` per beat into `video/raw/`.
  ~6–7 chunks (beat 3 may split into "play-to-COMPLETED" + "redo close-up").
- **Validation per chunk (real, not rubber-stamp):**
  - `ffprobe` → confirm resolution (≥1080p) + sane duration.
  - **Frame sampling:** I extract several frames per chunk (`ffmpeg -vf fps`) and *actually look at
    them* — catch a leaked secret in frame, wrong tab, the `0s` clock, cursor mishaps — **before**
    building audio for that chunk.
  - One bad beat = re-record just that beat.

---

## 5. Compilation (ffmpeg 8.1.2)

- Per chunk: overlay `beatN.mp3` onto the (silent) screen video; normalize with `loudnorm`.
- Concat all chunks → `praeco-demo.mp4`: **H.264, 1080p, `-movflags +faststart`** (instant web
  play), poster frame = a landing-hero still.
- Target ~40–90 MB. No music bed by default.
- Final QA before publish: full-length playback review, duration ≤ 5:00, no secret ever on screen.

---

## 6. `/pitch` page (judge one-pager)

New App Router route **`app/pitch/page.tsx`**, matching the existing neon-dark "Mission Control"
design system (Tailwind v4 + shadcn — **reuse existing primitives, no new UI subsystem**). Single
scroll, top→bottom:

1. **Hero** — "Praeco" + the 132-char tagline from the field sheet.
2. **Video** — embedded `<video controls preload="metadata" poster=…>` sourced from the Blob URL.
   The centerpiece; above the fold.
3. **Brief** — condensed BUIDL: *the problem → the two doors → why it's different*, 5–6 bullets.
4. **On-chain proof block** — real Door B deliver tx (`0x9754…`) + serviceId `5168a527…`, with the
   honest framing ("the replay is a recorded run; **this** tx is the real settlement") inline so a
   judge verifies without leaving the page.
5. **CTAs** — Live app · GitHub (MIT) · DoraHacks.

**Data:** all static/hardcoded copy + one env-or-constant `PITCH_VIDEO_URL` (the Blob URL). No new
API routes, no DB. **Test:** a route/component test asserting the video element, the real tx link,
and the three CTAs render (keeps the 229-green suite honest; ≥80% on new code per project standard).

---

## 7. Hosting the video — **Vercel Blob (primary)**

- Add `@vercel/blob`; provision `BLOB_READ_WRITE_TOKEN` (Vercel dashboard/CLI, also into local
  `~/Documents/secret/.env` + Vercel env). Free tier covers a demo video easily.
- Upload `praeco-demo.mp4` → get the public Blob URL → feed `/pitch`.
- **Rationale:** our infra, our control; and RECTOR's YouTube channel was removed **twice**
  (Dec 2025) — self-hosting the proof is the resilient call.
- **Rejected:** committing the ~50 MB binary to the **public** repo (permanent clone bloat).
- **Fallback (only if forced):** if DoraHacks' *Video field* hard-requires an embeddable platform
  URL, add a **Vimeo unlisted** mirror (not YouTube, given the channel history) — decided at filing,
  blocks nothing now.

---

## 8. Submission wiring

- **Website / live-demo field →** `https://praeco.rectorspace.com/pitch` — the judge hub (matches
  the "all in one page for judgement" intent). `/pitch` itself carries a **Live app** CTA to the root
  so judges can still try the real product.
- **Video field →** the direct Blob URL (or `/pitch` if the field accepts a page URL).
- **Sheet update (small):** `docs/BUIDL-submission.md` currently points Website → root and has Video
  ⧗; both get updated (Website → `/pitch`, Video → URL) as part of filing. Everything else on the
  sheet stays paste-ready.
- **Verification checkpoint (at filing):** confirm on the live DoraHacks form what the Video field
  accepts (SPA → Chrome MCP + RECTOR's login). If it rejects a self-hosted URL → §7 fallback.

---

## 9. Sequencing (dependencies)

```
NOW (CIPHER):  full script ─┐  audition voices ─┐  scaffold /pitch (placeholder video) ─┐
                            │                    │                                        │
RECTOR:                     │   pick voice ◄─────┘   record chunks ◄─────────────────────┤
                            │                        │                                    │
CIPHER:                     └──► fit+gen audio/chunk ─► validate ─► ffmpeg compile ─► final.mp4
CIPHER:                          Blob upload ─► wire /pitch ─► verify on prod ───────────┤
RECTOR+CIPHER:                   file BUIDL (Chrome + login) ◄────────────────────────────┘
```

**Hard dependencies on RECTOR:** (a) pick the voice, (b) record the chunks. Everything else
(script, `/pitch` scaffold, Blob wiring) proceeds in parallel while he's away from the keyboard.

---

## 10. Testing / verification (project standard)

- `pnpm test:run` (currently 229) + `pnpm typecheck` + `pnpm exec next build` **green before every
  commit**; branch → PR → merge (`--merge --delete-branch`); GPG-signed; **no AI attribution**.
- New `/pitch` route gets a component/route test.
- Media scripts (`ffmpeg`/ElevenLabs helpers) get at least a smoke check + are `--dry-run`-able where
  it saves API credits.
- **Final gate:** video actually plays on **prod** `/pitch`, all links resolve, duration ≤ 5:00, no
  secret ever on screen, integrity line intact.
- **`pnpm exec tsx`** for any TS script (no global `tsx` on this machine).

---

## 11. Risks / open items

| Risk | Mitigation |
|---|---|
| DoraHacks Video field rejects a self-hosted URL | `/pitch` holds the video regardless; add Vimeo-unlisted mirror at filing if forced (§7). |
| Recording drift / retakes | Screen-first + per-chunk = fit audio to video; re-record only the bad beat. |
| Secret leaks on camera | Frame-sampling validation (§4) before any chunk is accepted. |
| Integrity blur (mock vs real) | Script + camera rules enforce it; only `0x9754…` shown as real. |
| Blob free-tier limits | Demo-scale traffic; well within free allotment. Monitor if it goes viral (good problem). |
| Deadline | ~6 days runway; the only human-gated steps are voice-pick + recording. |

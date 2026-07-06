# Praeco Demo Video + `/pitch` Judge Page — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce a ≤5-min dev-humble AI-narrated demo video, self-host it on Vercel Blob, embed it on a judge-facing `/pitch` page, and file the DoraHacks BUIDL — the last submission blocker.

**Architecture:** Screen-first, chunked recording (RECTOR) → per-chunk narration fitted to measured duration (ElevenLabs REST via `fetch`, no SDK) → ffmpeg mux+concat → `praeco-demo.mp4` → Vercel Blob → embedded on `app/pitch/page.tsx` (server component, reuses the existing neon-dark design system). Video pipeline lives in `scripts/video/`; the only piece with real logic (fit math) is a pure, unit-tested module. Human-gated steps (voice pick, recording, filing) are explicit checkpoints.

**Tech Stack:** Next.js 15 App Router, React 19, Tailwind v4 + shadcn, vitest + @testing-library/react (jsdom), tsx, ffmpeg 8.1.2, ElevenLabs REST API, `@vercel/blob`.

## Global Constraints

- **Node** ≥ 22.19.0 (`package.json` engines). Global `fetch`/`Buffer` available.
- **No global `tsx`** on this machine → run scripts with `pnpm exec tsx <script>` (or the `pnpm run` alias). Never bare `tsx`.
- **Scripts load env** with `import "dotenv/config";` as the first import; secrets (`ELEVENLABS_API_KEY`, `BLOB_READ_WRITE_TOKEN`) come from the shell env (`~/Documents/secret/.env`, auto-loaded) and/or local `.env`.
- **Tests:** colocated `*.test.ts(x)`; `.tsx` tests start with `// @vitest-environment jsdom`; `globals: true` (use `test`/`expect`/`vi` unimported); `@` alias = repo root. Run `pnpm test:run`.
- **Green before every commit:** `pnpm test:run` (currently **229**, must not regress) + `pnpm typecheck` + `pnpm exec next build`.
- **Git:** work on `feat/demo-pitch`; one logical unit per commit; **GPG-sign** (key `BF47B9DC1FA320FA`, `git commit -S`); **NO AI attribution** of any kind; PR → merge `--merge --delete-branch`.
- **Design system:** reuse existing primitives (`@/components/ui/button`, `GridBackdrop`, `LiveDot`, `StatusPill`, lucide-react); neon palette classes (`bg-ground text-ink`, etc.). No new UI subsystem.
- **Video:** ≤ **5:00**; H.264 1080p `+faststart`; dev-humble first-person **male** narration.
- **Integrity (hard-DQ + 10% audit):** the replay is *"a recorded run of the engine"*; the **only** real settlement shown is Door B tx `0x97547499e592dc1b4390e3a11213502f9fabc0dec5fe5fba4e4362cdf886ad84`; never show `.env`, the CROO SDK key, the agent wallet key, any replay Basescan link, or the Theater `0s` clock.
- **Hosting:** Vercel Blob primary; Vimeo-unlisted fallback only if the DoraHacks Video field rejects a self-hosted URL.
- **`video/` working dir is git-ignored** (raw takes, mp3s, intermediate/finished mp4s never committed).

---

## File Structure

**Create:**
- `scripts/video/lib/fit.ts` — pure fit math (video↔audio duration reconciliation). **Unit-tested.**
- `scripts/video/lib/fit.test.ts` — its tests.
- `scripts/video/tts.ts` — ElevenLabs generator CLI (`--voice`, `--voices`, `--model`, `--text`/`--file`, `--out`, `--dry-run`, `--list`). REST via `fetch`.
- `scripts/video/tts.test.ts` — arg-parse + dry-run + cost-estimate tests (no network).
- `scripts/video/validate-chunk.ts` — `ffprobe` a raw chunk + extract frames for visual review.
- `scripts/video/compile.ts` — read `video/manifest.json` → per-chunk mux (using `fit.ts`) → concat → `video/out/praeco-demo.mp4`.
- `scripts/video/compile.test.ts` — manifest parse + ffmpeg-arg construction tests (no encode).
- `scripts/video/upload-blob.ts` — upload the final mp4 to Vercel Blob, print the public URL.
- `app/pitch/page.tsx` — the judge one-pager (server component).
- `app/pitch/page.test.tsx` — route test.
- `app/pitch/content.ts` — static pitch copy + on-chain proof constants + `PITCH_VIDEO_URL`.

**Modify:**
- `.gitignore` — add `video/`.
- `package.json` — add `@vercel/blob` dep; add `video:tts`, `video:validate`, `video:compile`, `video:upload` scripts.
- `docs/BUIDL.md` — insert the video URL (~line 55) at filing.
- `docs/BUIDL-submission.md` — Video field + Website→`/pitch` at filing.

---

## Task 1: Fit math (`scripts/video/lib/fit.ts`)

The one piece of real logic: given a recorded chunk's duration and the generated narration's duration, decide how to reconcile them — pad trailing silence (audio shorter), gently speed up (audio ≤8% longer), or signal "re-trim the copy" (audio too long). Video is the master clock.

**Files:**
- Create: `scripts/video/lib/fit.ts`
- Test: `scripts/video/lib/fit.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `computeFit(videoSec: number, audioSec: number): FitPlan` and `interface FitPlan { action: "pad" | "atempo" | "retrim"; atempo: number; padSeconds: number }`. `estimateChars(targetSec: number, cps?: number): number`.

- [ ] **Step 1: Write the failing test**

```ts
// scripts/video/lib/fit.test.ts
import { computeFit, estimateChars } from "./fit";

test("audio shorter than video → pad the remainder with silence", () => {
  expect(computeFit(30, 24)).toEqual({ action: "pad", atempo: 1, padSeconds: 6 });
});

test("audio ≤8% longer → gentle atempo speed-up, no pad", () => {
  const plan = computeFit(30, 32); // 6.7% over
  expect(plan.action).toBe("atempo");
  expect(plan.atempo).toBeCloseTo(1.067, 2);
  expect(plan.padSeconds).toBe(0);
});

test("audio >8% longer → retrim (copy must be shortened), atempo clamped", () => {
  const plan = computeFit(30, 40);
  expect(plan.action).toBe("retrim");
  expect(plan.atempo).toBe(1.08);
});

test("non-positive durations throw", () => {
  expect(() => computeFit(0, 10)).toThrow();
  expect(() => computeFit(10, -1)).toThrow();
});

test("estimateChars sizes copy to a duration at ~15 cps with 10% margin", () => {
  expect(estimateChars(30)).toBe(405); // floor(30 * 15 * 0.9)
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run scripts/video/lib/fit.test.ts`
Expected: FAIL — `Cannot find module './fit'`.

- [ ] **Step 3: Write minimal implementation**

```ts
// scripts/video/lib/fit.ts
export interface FitPlan {
  action: "pad" | "atempo" | "retrim";
  atempo: number; // 1.0 = unchanged; >1 speeds audio up
  padSeconds: number; // trailing silence added when action === "pad"
}

const MAX_ATEMPO = 1.08; // never speed narration more than 8% — stays natural

const round3 = (n: number) => Math.round(n * 1000) / 1000;

export function computeFit(videoSec: number, audioSec: number): FitPlan {
  if (videoSec <= 0 || audioSec <= 0) {
    throw new Error(`durations must be > 0 (video=${videoSec}, audio=${audioSec})`);
  }
  if (audioSec <= videoSec) {
    return { action: "pad", atempo: 1, padSeconds: round3(videoSec - audioSec) };
  }
  const needed = audioSec / videoSec;
  if (needed <= MAX_ATEMPO) {
    return { action: "atempo", atempo: round3(needed), padSeconds: 0 };
  }
  return { action: "retrim", atempo: MAX_ATEMPO, padSeconds: 0 };
}

// Target character count for a beat so the narration speaks in ~targetSec.
// ~15 chars/sec is a natural conversational pace; 10% margin keeps us under length.
export function estimateChars(targetSec: number, cps = 15): number {
  if (targetSec <= 0) throw new Error(`targetSec must be > 0 (got ${targetSec})`);
  return Math.floor(targetSec * cps * 0.9);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run scripts/video/lib/fit.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add scripts/video/lib/fit.ts scripts/video/lib/fit.test.ts
git commit -S -m "feat(video): fit math for audio↔video duration reconciliation"
```

---

## Task 2: ElevenLabs TTS generator (`scripts/video/tts.ts`)

CLI that renders narration text to an mp3 via the ElevenLabs REST API (`fetch`, no SDK dep). Supports `--dry-run` (prints char count + credit estimate, no network — this is what's tested), `--voices a,b,c` (audition: same text across voices), and `--list` (fetch the account's voices to confirm IDs).

**Files:**
- Create: `scripts/video/tts.ts`, `scripts/video/tts.test.ts`
- Modify: `package.json` (add `"video:tts": "tsx scripts/video/tts.ts"`)

**Interfaces:**
- Consumes: `estimateChars` is NOT used here; `process.env.ELEVENLABS_API_KEY`.
- Produces: exported pure helpers `parseArgs(argv: string[]): TtsArgs`, `estimateCredits(chars: number, model: string): number`, `buildTtsUrl(voiceId: string): string`. `interface TtsArgs { text?: string; file?: string; voices: string[]; model: string; out?: string; dryRun: boolean; list: boolean }`. Default model `eleven_multilingual_v2`.

- [ ] **Step 1: Write the failing test**

```ts
// scripts/video/tts.test.ts
import { parseArgs, estimateCredits, buildTtsUrl } from "./tts";

test("parseArgs reads text, voices, model, out, and flags", () => {
  const a = parseArgs(["--text", "hello there", "--voices", "v1,v2", "--model", "eleven_flash_v2_5", "--out", "x.mp3", "--dry-run"]);
  expect(a.text).toBe("hello there");
  expect(a.voices).toEqual(["v1", "v2"]);
  expect(a.model).toBe("eleven_flash_v2_5");
  expect(a.out).toBe("x.mp3");
  expect(a.dryRun).toBe(true);
});

test("parseArgs defaults model to multilingual_v2 and dryRun false", () => {
  const a = parseArgs(["--text", "hi", "--voices", "v1"]);
  expect(a.model).toBe("eleven_multilingual_v2");
  expect(a.dryRun).toBe(false);
});

test("flash/turbo models bill 0.5 credits/char; others 1.0", () => {
  expect(estimateCredits(100, "eleven_flash_v2_5")).toBe(50);
  expect(estimateCredits(100, "eleven_turbo_v2_5")).toBe(50);
  expect(estimateCredits(100, "eleven_multilingual_v2")).toBe(100);
});

test("buildTtsUrl targets the voice with an mp3 output format", () => {
  expect(buildTtsUrl("abc123")).toBe(
    "https://api.elevenlabs.io/v1/text-to-speech/abc123?output_format=mp3_44100_128"
  );
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run scripts/video/tts.test.ts`
Expected: FAIL — `Cannot find module './tts'`.

- [ ] **Step 3: Write minimal implementation**

```ts
// scripts/video/tts.ts
import "dotenv/config";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

export interface TtsArgs {
  text?: string;
  file?: string;
  voices: string[];
  model: string;
  out?: string;
  dryRun: boolean;
  list: boolean;
}

const HALF_CREDIT_MODELS = new Set(["eleven_flash_v2_5", "eleven_turbo_v2_5"]);

export function parseArgs(argv: string[]): TtsArgs {
  const get = (flag: string) => {
    const i = argv.indexOf(flag);
    return i >= 0 && i + 1 < argv.length ? argv[i + 1] : undefined;
  };
  return {
    text: get("--text"),
    file: get("--file"),
    voices: (get("--voices") ?? "").split(",").map((s) => s.trim()).filter(Boolean),
    model: get("--model") ?? "eleven_multilingual_v2",
    out: get("--out"),
    dryRun: argv.includes("--dry-run"),
    list: argv.includes("--list"),
  };
}

export function estimateCredits(chars: number, model: string): number {
  return HALF_CREDIT_MODELS.has(model) ? chars * 0.5 : chars;
}

export function buildTtsUrl(voiceId: string): string {
  return `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`;
}

async function render(voiceId: string, text: string, model: string, out: string, apiKey: string) {
  const res = await fetch(buildTtsUrl(voiceId), {
    method: "POST",
    headers: { "xi-api-key": apiKey, "content-type": "application/json" },
    body: JSON.stringify({ text, model_id: model }),
  });
  if (!res.ok) throw new Error(`ElevenLabs ${res.status}: ${await res.text()}`);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, Buffer.from(await res.arrayBuffer()));
  console.log(`✓ ${out}  (${text.length} chars, ${estimateCredits(text.length, model)} credits, ${model}, voice ${voiceId})`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) throw new Error("ELEVENLABS_API_KEY not set (shell env / ~/Documents/secret/.env)");

  if (args.list) {
    const res = await fetch("https://api.elevenlabs.io/v1/voices", { headers: { "xi-api-key": apiKey } });
    if (!res.ok) throw new Error(`ElevenLabs ${res.status}: ${await res.text()}`);
    const data = (await res.json()) as { voices: { voice_id: string; name: string; labels?: Record<string, string> }[] };
    for (const v of data.voices) console.log(`${v.voice_id}\t${v.name}\t${JSON.stringify(v.labels ?? {})}`);
    return;
  }

  const text = args.text ?? (args.file ? readFileSync(args.file, "utf8").trim() : undefined);
  if (!text) throw new Error("provide --text or --file");
  if (args.voices.length === 0) throw new Error("provide --voices id[,id...]");

  if (args.dryRun) {
    for (const v of args.voices) {
      console.log(`[dry-run] voice ${v}: ${text.length} chars → ${estimateCredits(text.length, args.model)} credits (${args.model})`);
    }
    return;
  }

  for (const v of args.voices) {
    const out = args.voices.length > 1 ? `video/audition/${v}.mp3` : (args.out ?? "video/audio/out.mp3");
    await render(v, text, args.model, out, apiKey);
  }
}

// Run only as a CLI, not when imported by tests.
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run scripts/video/tts.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Add the package.json script**

Add to `"scripts"`: `"video:tts": "tsx scripts/video/tts.ts",`

- [ ] **Step 6: Commit**

```bash
git add scripts/video/tts.ts scripts/video/tts.test.ts package.json
git commit -S -m "feat(video): ElevenLabs TTS generator (REST, dry-run, audition, list)"
```

---

## Task 3: Chunk validation (`scripts/video/validate-chunk.ts`)

Given a raw recorded chunk, print its `ffprobe` summary (resolution + duration) and extract N frames to `video/frames/<name>/` for a human/CIPHER eyeball pass (leaked secrets, wrong tab, `0s` clock).

**Files:**
- Create: `scripts/video/validate-chunk.ts`
- Modify: `package.json` (`"video:validate": "tsx scripts/video/validate-chunk.ts"`)

**Interfaces:**
- Consumes: nothing (shells to `ffprobe`/`ffmpeg`).
- Produces: CLI only — `pnpm exec tsx scripts/video/validate-chunk.ts <path-to-chunk> [frames=6]`. No exported logic worth unit-testing beyond arg presence; covered by manual smoke.

- [ ] **Step 1: Write the implementation**

```ts
// scripts/video/validate-chunk.ts
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { basename, extname, join } from "node:path";

function durationSec(input: string): number {
  const out = execFileSync("ffprobe", [
    "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", input,
  ]).toString().trim();
  const n = Number(out);
  if (!Number.isFinite(n) || n <= 0) throw new Error(`bad duration for ${input}: ${out}`);
  return n;
}

function main() {
  const [input, framesArg] = process.argv.slice(2);
  if (!input) throw new Error("usage: validate-chunk <path-to-chunk> [frameCount=6]");
  const frames = Math.max(1, Number(framesArg ?? 6));

  const probe = execFileSync("ffprobe", [
    "-v", "error",
    "-select_streams", "v:0",
    "-show_entries", "stream=width,height:format=duration",
    "-of", "default=noprint_wrappers=1",
    input,
  ]).toString();
  console.log(`--- ${input} ---\n${probe}`);

  const dur = durationSec(input);
  const name = basename(input, extname(input));
  const outDir = join("video", "frames", name);
  mkdirSync(outDir, { recursive: true });
  // `frames` samples spread evenly across the WHOLE clip (fps = frames/duration),
  // so a secret that appears late in the take is still caught.
  execFileSync("ffmpeg", [
    "-y", "-i", input,
    "-vf", `fps=${frames}/${dur.toFixed(3)}`,
    "-frames:v", String(frames),
    join(outDir, "frame-%02d.png"),
  ], { stdio: "inherit" });
  console.log(`✓ ${frames} frames → ${outDir} (review for leaked secrets / wrong tab / 0s clock)`);
}

try {
  main();
} catch (e) {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
}
```

- [ ] **Step 2: Smoke-test against any existing video asset (or skip if none)**

Run: `pnpm exec tsx scripts/video/validate-chunk.ts <any.mp4> 4` — Expected: prints width/height/duration and writes 4 PNGs. (If no sample video exists yet, defer this smoke to Task 8 when the first real chunk lands.)

- [ ] **Step 3: Add the package.json script + commit**

Add `"video:validate": "tsx scripts/video/validate-chunk.ts",`

```bash
git add scripts/video/validate-chunk.ts package.json
git commit -S -m "feat(video): chunk validator (ffprobe summary + frame extraction)"
```

---

## Task 4: Compile (`scripts/video/compile.ts`)

Read `video/manifest.json` (`[{ beat, video, audio }]`), and for each chunk: measure both durations with `ffprobe`, ask `computeFit`, mux the fitted audio onto the (silent) video, normalize loudness, re-encode to a common 1080p/H.264 profile → `video/proc/<beat>.mp4`. Then concat all → `video/out/praeco-demo.mp4` with `+faststart`. Testable surface: manifest parsing + the ffmpeg audio-filter string per `FitPlan`.

**Files:**
- Create: `scripts/video/compile.ts`, `scripts/video/compile.test.ts`
- Modify: `package.json` (`"video:compile": "tsx scripts/video/compile.ts"`)

**Interfaces:**
- Consumes: `computeFit`, `FitPlan` from `./lib/fit`.
- Produces: `audioFilter(plan: FitPlan): string`, `parseManifest(json: string): Chunk[]`, `interface Chunk { beat: string; video: string; audio: string }`.

- [ ] **Step 1: Write the failing test**

```ts
// scripts/video/compile.test.ts
import { audioFilter, parseManifest } from "./compile";

test("pad plan → apad with the trailing silence duration + loudnorm", () => {
  expect(audioFilter({ action: "pad", atempo: 1, padSeconds: 6 }))
    .toBe("apad=pad_dur=6,loudnorm");
});

test("atempo plan → atempo then loudnorm", () => {
  expect(audioFilter({ action: "atempo", atempo: 1.067, padSeconds: 0 }))
    .toBe("atempo=1.067,loudnorm");
});

test("retrim plan is rejected — copy must be shortened first", () => {
  expect(() => audioFilter({ action: "retrim", atempo: 1.08, padSeconds: 0 })).toThrow();
});

test("parseManifest returns the chunk list", () => {
  const chunks = parseManifest('[{"beat":"1","video":"video/raw/1.mov","audio":"video/audio/1.mp3"}]');
  expect(chunks).toEqual([{ beat: "1", video: "video/raw/1.mov", audio: "video/audio/1.mp3" }]);
});

test("parseManifest rejects a missing field", () => {
  expect(() => parseManifest('[{"beat":"1","video":"x"}]')).toThrow();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run scripts/video/compile.test.ts`
Expected: FAIL — `Cannot find module './compile'`.

- [ ] **Step 3: Write minimal implementation**

```ts
// scripts/video/compile.ts
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { computeFit, type FitPlan } from "./lib/fit";

export interface Chunk { beat: string; video: string; audio: string }

export function parseManifest(json: string): Chunk[] {
  const raw = JSON.parse(json);
  if (!Array.isArray(raw)) throw new Error("manifest must be a JSON array");
  return raw.map((c, i) => {
    if (!c || typeof c.beat !== "string" || typeof c.video !== "string" || typeof c.audio !== "string") {
      throw new Error(`manifest[${i}] must have string beat/video/audio`);
    }
    return { beat: c.beat, video: c.video, audio: c.audio };
  });
}

export function audioFilter(plan: FitPlan): string {
  if (plan.action === "pad") return `apad=pad_dur=${plan.padSeconds},loudnorm`;
  if (plan.action === "atempo") return `atempo=${plan.atempo},loudnorm`;
  throw new Error("retrim plan: narration is >8% too long — shorten the beat copy and regenerate");
}

function durationSec(path: string): number {
  const out = execFileSync("ffprobe", [
    "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", path,
  ]).toString().trim();
  const n = Number(out);
  if (!Number.isFinite(n) || n <= 0) throw new Error(`bad duration for ${path}: ${out}`);
  return n;
}

function main() {
  const manifest = parseManifest(readFileSync("video/manifest.json", "utf8"));
  mkdirSync("video/proc", { recursive: true });
  mkdirSync("video/out", { recursive: true });

  const procList: string[] = [];
  for (const c of manifest) {
    const plan = computeFit(durationSec(c.video), durationSec(c.audio));
    if (plan.action === "retrim") throw new Error(`beat ${c.beat}: ${audioFilter.name} would reject — shorten copy`);
    const proc = `video/proc/${c.beat}.mp4`;
    // Both chains in ONE -filter_complex (mixing -vf with -filter_complex errors).
    // Video is normalized to a common 1080p/30fps profile so the final concat can `-c copy`.
    const vchain = "scale=-2:1080,format=yuv420p,fps=30";
    execFileSync("ffmpeg", [
      "-y", "-i", c.video, "-i", c.audio,
      "-filter_complex", `[0:v]${vchain}[v];[1:a]${audioFilter(plan)}[a]`,
      "-map", "[v]", "-map", "[a]",
      "-c:v", "libx264", "-preset", "medium", "-crf", "21",
      "-c:a", "aac", "-b:a", "160k", "-ar", "48000",
      "-shortest", proc,
    ], { stdio: "inherit" });
    procList.push(proc);
    console.log(`✓ beat ${c.beat} → ${proc} (${plan.action})`);
  }

  const listPath = "video/proc/concat.txt";
  writeFileSync(listPath, procList.map((p) => `file '${p.replace("video/proc/", "")}'`).join("\n"));
  execFileSync("ffmpeg", [
    "-y", "-f", "concat", "-safe", "0", "-i", listPath,
    "-c", "copy", "-movflags", "+faststart", "video/out/praeco-demo.mp4",
  ], { stdio: "inherit" });
  console.log("✓ video/out/praeco-demo.mp4");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try { main(); } catch (e) { console.error(e instanceof Error ? e.message : e); process.exit(1); }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run scripts/video/compile.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Add the package.json script + commit**

Add `"video:compile": "tsx scripts/video/compile.ts",`

```bash
git add scripts/video/compile.ts scripts/video/compile.test.ts package.json
git commit -S -m "feat(video): ffmpeg compile (per-chunk fit+mux, loudnorm, concat, faststart)"
```

---

## Task 5: `.gitignore` + `@vercel/blob` + upload script (`scripts/video/upload-blob.ts`)

Ignore the working dir, add the Blob dep, and a tiny uploader that pushes the final mp4 and prints the public URL.

**Files:**
- Modify: `.gitignore`, `package.json`
- Create: `scripts/video/upload-blob.ts`

**Interfaces:**
- Consumes: `process.env.BLOB_READ_WRITE_TOKEN`, `@vercel/blob` `put`.
- Produces: CLI — `pnpm exec tsx scripts/video/upload-blob.ts [path=video/out/praeco-demo.mp4]` → prints `url`.

- [ ] **Step 1: Ignore the working dir**

Append to `.gitignore`:
```
# demo-video working dir (raw takes, mp3s, intermediate + final renders)
video/
```

- [ ] **Step 2: Add the dependency**

Run: `pnpm add @vercel/blob`
Expected: `@vercel/blob` appears under `dependencies`.

- [ ] **Step 3: Write the uploader**

```ts
// scripts/video/upload-blob.ts
import "dotenv/config";
import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { put } from "@vercel/blob";

async function main() {
  const path = process.argv[2] ?? "video/out/praeco-demo.mp4";
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) throw new Error("BLOB_READ_WRITE_TOKEN not set (Vercel dashboard → Storage → Blob)");
  const body = readFileSync(path);
  const { url } = await put(`demo/${basename(path)}`, body, {
    access: "public",
    contentType: "video/mp4",
    token,
    addRandomSuffix: false,
    allowOverwrite: true,
  });
  console.log(url);
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
```

- [ ] **Step 4: Add the package.json script + commit**

Add `"video:upload": "tsx scripts/video/upload-blob.ts",`

```bash
git add .gitignore package.json pnpm-lock.yaml scripts/video/upload-blob.ts
git commit -S -m "feat(video): git-ignore working dir, add @vercel/blob + upload script"
```

---

## Task 6: `/pitch` judge page (`app/pitch/page.tsx`)

Judge one-pager on the existing neon design system. Server component, all static copy from `app/pitch/content.ts`. The video `<video>` renders when `PITCH_VIDEO_URL` is set (filled in Task 10); until then a labelled placeholder holds its slot — so the page (and its test) are stable across the URL-set transition.

**Files:**
- Create: `app/pitch/content.ts`, `app/pitch/page.tsx`, `app/pitch/page.test.tsx`

**Interfaces:**
- Consumes: `@/components/ui/button` (`Button`), `@/components/ui/GridBackdrop` (`GridBackdrop`), `lucide-react` icons.
- Produces: default export `Pitch` (sync server component); `PITCH_VIDEO_URL`, `PROOF`, `BULLETS` from `content.ts`.

- [ ] **Step 1: Write the content module**

```ts
// app/pitch/content.ts
// Set by scripts/video/upload-blob.ts output in Task 10. Empty = placeholder state.
export const PITCH_VIDEO_URL = "";

export const TAGLINE =
  "Give Praeco one sentence; it hires, pays, and QA's real CROO agents, then returns a ready-to-post launch kit with on-chain receipts.";

export const BULLETS: string[] = [
  "The problem: great products die at launch — positioning, copy, an OG image, the PH/HN posts, a tweet thread — a dozen specialist jobs nobody has time to coordinate.",
  "Door A (buyer): describe your product in one sentence; Praeco writes the brief and hires one real specialist agent per leg on the CROO marketplace — negotiating, paying in USDC on Base, and taking delivery.",
  "QA curation: an art-director pass grades every deliverable (accept / redo / swap), so raw marketplace output becomes a coherent kit.",
  "Door B (seller): Praeco is a registered seller on the CROO Store — and it verifies it can staff every leg before accepting, rejecting-with-reason rather than charging for a job it can't deliver.",
  "Verifiable: every asset carries a provenance card (agent · cost · content hash); the seller order below settled on Base mainnet.",
  "Open source, MIT.",
];

export const PROOF = {
  serviceId: "5168a527-df1d-45fb-bcaa-a638f2a1fcf9",
  deliverTx: "0x97547499e592dc1b4390e3a11213502f9fabc0dec5fe5fba4e4362cdf886ad84",
  basescan:
    "https://basescan.org/tx/0x97547499e592dc1b4390e3a11213502f9fabc0dec5fe5fba4e4362cdf886ad84",
};

export const LINKS = {
  app: "https://praeco.rectorspace.com",
  repo: "https://github.com/RECTOR-LABS/praeco",
  dorahacks: "https://dorahacks.io/hackathon/croo-hackathon",
};
```

- [ ] **Step 2: Write the failing test**

```tsx
// app/pitch/page.test.tsx
// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import Pitch from "./page";
import { PROOF } from "./content";

test("pitch page renders tagline, the REAL on-chain tx link, and the three CTAs", () => {
  render(<Pitch />);
  expect(screen.getByText(/one sentence/i)).toBeInTheDocument();

  const tx = screen.getByRole("link", { name: /verify on basescan/i });
  expect(tx).toHaveAttribute("href", PROOF.basescan);

  expect(screen.getByRole("link", { name: /live app/i })).toHaveAttribute("href", "https://praeco.rectorspace.com");
  expect(screen.getByRole("link", { name: /github/i })).toHaveAttribute("href", "https://github.com/RECTOR-LABS/praeco");
  expect(screen.getByRole("link", { name: /dorahacks/i })).toHaveAttribute("href", "https://dorahacks.io/hackathon/croo-hackathon");
});

test("video slot is present (placeholder until the Blob URL is set)", () => {
  render(<Pitch />);
  expect(screen.getByTestId("pitch-video")).toBeInTheDocument();
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm exec vitest run app/pitch/page.test.tsx`
Expected: FAIL — `Cannot find module './page'`.

- [ ] **Step 4: Write the page**

```tsx
// app/pitch/page.tsx
import type { Metadata } from "next";
import { ExternalLink, Github, Rocket, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { GridBackdrop } from "@/components/ui/GridBackdrop";
import { PITCH_VIDEO_URL, TAGLINE, BULLETS, PROOF, LINKS } from "./content";

export const metadata: Metadata = {
  title: "Praeco — Pitch",
  description: "Autonomous launch-kit composer on the CROO Agent Protocol. Watch the 5-minute demo.",
};

export default function Pitch() {
  return (
    <main className="relative isolate min-h-screen bg-ground text-ink">
      <GridBackdrop />

      <section className="mx-auto max-w-4xl px-6 pt-16 pb-10 text-center">
        <span className="font-mono text-sm font-semibold tracking-tight text-live">Praeco</span>
        <h1 className="mt-4 text-balance text-3xl font-semibold sm:text-4xl">
          {TAGLINE}
        </h1>
      </section>

      {/* Video */}
      <section className="mx-auto max-w-4xl px-6">
        <div
          data-testid="pitch-video"
          className="overflow-hidden rounded-xl border border-white/10 bg-panel shadow-2xl"
        >
          {PITCH_VIDEO_URL ? (
            <video
              controls
              preload="metadata"
              className="aspect-video w-full"
              src={PITCH_VIDEO_URL}
            />
          ) : (
            <div className="flex aspect-video w-full items-center justify-center text-sm text-ink/50">
              Demo video publishing shortly.
            </div>
          )}
        </div>
      </section>

      {/* Brief */}
      <section className="mx-auto max-w-3xl px-6 py-12">
        <h2 className="mb-4 text-lg font-semibold">What it is</h2>
        <ul className="space-y-3">
          {BULLETS.map((b, i) => (
            <li key={i} className="flex gap-3 text-sm leading-relaxed text-ink/80">
              <span className="mt-1 text-live">▹</span>
              <span>{b}</span>
            </li>
          ))}
        </ul>
      </section>

      {/* On-chain proof */}
      <section className="mx-auto max-w-3xl px-6 pb-12">
        <div className="rounded-xl border border-white/10 bg-panel p-6">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <ShieldCheck className="h-5 w-5 text-live" /> Real, on-chain
          </h2>
          <p className="mt-2 text-sm text-ink/70">
            The demo replay is a recorded run of the engine. This is the real Door B settlement —
            a seller order paid and delivered on Base mainnet, with a committed content hash.
          </p>
          <dl className="mt-4 space-y-1 font-mono text-xs text-ink/70">
            <div>CROO listing serviceId: {PROOF.serviceId}</div>
            <div className="break-all">deliver txHash: {PROOF.deliverTx}</div>
          </dl>
          <Button asChild variant="secondary" size="sm" className="mt-4">
            <a href={PROOF.basescan} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="h-4 w-4" /> Verify on Basescan
            </a>
          </Button>
        </div>
      </section>

      {/* CTAs */}
      <section className="mx-auto flex max-w-3xl flex-wrap justify-center gap-3 px-6 pb-24">
        <Button asChild>
          <a href={LINKS.app} target="_blank" rel="noopener noreferrer">
            <Rocket className="h-4 w-4" /> Live app
          </a>
        </Button>
        <Button asChild variant="secondary">
          <a href={LINKS.repo} target="_blank" rel="noopener noreferrer">
            <Github className="h-4 w-4" /> GitHub
          </a>
        </Button>
        <Button asChild variant="ghost">
          <a href={LINKS.dorahacks} target="_blank" rel="noopener noreferrer">
            <ExternalLink className="h-4 w-4" /> DoraHacks
          </a>
        </Button>
      </section>
    </main>
  );
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm exec vitest run app/pitch/page.test.tsx`
Expected: PASS (2 tests). If a palette class (`bg-panel`, `text-live`) doesn't exist, grep `app/globals.css` / existing components for the real token and swap it — do not invent tokens.

- [ ] **Step 6: Full green gate + commit**

Run: `pnpm test:run && pnpm typecheck && pnpm exec next build`
Expected: all green, 229 + new tests pass, `/pitch` in the route list.

```bash
git add app/pitch/
git commit -S -m "feat(pitch): judge one-pager — video slot, brief, on-chain proof, CTAs"
```

- [ ] **Step 7: PR + merge (deploys `/pitch` to prod with the placeholder video)**

```bash
git -c credential.helper= -c 'credential.helper=!gh auth git-credential' push origin feat/demo-pitch
gh pr create --title "Demo video pipeline + /pitch judge page" --body "Scripts for the demo-video pipeline (fit math, ElevenLabs TTS, chunk validation, ffmpeg compile, Blob upload) + the /pitch judge page. Video URL wired in a follow-up once recorded." --base main
```
Merge only after the checkpoint review below (or keep the PR open and land it together with Task 10's URL wiring — see handoff).

---

## Task 7 (CHECKPOINT · human-gated): Voice audition

- [ ] **Step 1: Install the ElevenLabs skill** (confirms current API + male voice IDs)

Run: `npx skills add elevenlabs/skills`

- [ ] **Step 2: List available male voices** (if the curated IDs 404, use these)

Run: `pnpm exec tsx scripts/video/tts.ts --list` → note male, conversational voice IDs.

- [ ] **Step 3: Dry-run the audition (cost check, no spend)**

Run:
```bash
pnpm exec tsx scripts/video/tts.ts --model eleven_flash_v2_5 --voices <id1>,<id2>,<id3>,<id4> \
  --text "So, you know how a lot of good products kinda just die at launch? That's basically why I built Praeco — you give it one sentence, and it hires real agents to do the whole launch." --dry-run
```
Expected: per-voice char/credit estimate.

- [ ] **Step 4: Generate the audition clips**

Re-run without `--dry-run` → writes `video/audition/<id>.mp3` per voice.

- [ ] **Step 5: RECTOR picks by ear.** Record the chosen `voice_id`. **Acceptance:** one voice_id chosen for the final renders. (No commit — audition audio is git-ignored.)

---

## Task 8 (CHECKPOINT · human-gated): Record chunks + fit audio per chunk

CIPHER hands RECTOR a shot card per beat (SHOW actions + target duration + do-NOT-show list, from `docs/demo-run-sheet.md`). Loop per beat:

- [ ] **Step 1: RECTOR records** beat N → `video/raw/<N>.mov` (Cmd+Shift+5 / QuickTime). ~6–7 chunks (beat 3 may split).
- [ ] **Step 2: Validate the chunk**

Run: `pnpm exec tsx scripts/video/validate-chunk.ts video/raw/<N>.mov`
CIPHER reviews the frames for leaked secrets / wrong tab / `0s` clock. Bad → re-record just this beat.

- [ ] **Step 3: Finalize + generate the beat's narration to fit**

CIPHER sizes the beat copy to the measured duration (`estimateChars`), then:
```bash
pnpm exec tsx scripts/video/tts.ts --model eleven_multilingual_v2 --voices <chosen> \
  --text "<final beat copy>" --out video/audio/<N>.mp3
```

- [ ] **Step 4: Add the chunk to `video/manifest.json`** (`{ "beat": "<N>", "video": "video/raw/<N>.mov", "audio": "video/audio/<N>.mp3" }`).

**Acceptance:** all beats recorded, validated (no secrets on screen), audio generated, manifest complete. (All under git-ignored `video/`.)

---

## Task 9 (CHECKPOINT): Compile + review

- [ ] **Step 1: Compile**

Run: `pnpm exec tsx scripts/video/compile.ts` → `video/out/praeco-demo.mp4`.
If any beat reports `retrim` (narration >8% too long), shorten that beat's copy, regenerate its mp3 (Task 8 step 3), recompile.

- [ ] **Step 2: Final QA** — watch the full render end-to-end. **Acceptance:** duration ≤ 5:00; audio in sync; loudness even; **no secret ever on screen**; integrity line intact (replay = "recorded run"; only `0x9754…` shown as real).

---

## Task 10 (CHECKPOINT): Publish + wire `/pitch` + verify on prod

- [ ] **Step 1: Provision Blob** — Vercel dashboard → Storage → create a Blob store on the Praeco project; copy `BLOB_READ_WRITE_TOKEN` into `~/Documents/secret/.env` (local) and Vercel project env.
- [ ] **Step 2: Upload**

Run: `pnpm exec tsx scripts/video/upload-blob.ts` → copy the printed public URL.

- [ ] **Step 3: Wire the page** — set `PITCH_VIDEO_URL` in `app/pitch/content.ts` to the Blob URL.
- [ ] **Step 4: Green gate + commit**

Run: `pnpm test:run && pnpm typecheck && pnpm exec next build`
```bash
git add app/pitch/content.ts
git commit -S -m "feat(pitch): wire self-hosted demo video URL"
```

- [ ] **Step 5: Merge → auto-deploy → verify on prod** — merge the PR (`gh pr merge <n> --merge --delete-branch`); after deploy, load `https://praeco.rectorspace.com/pitch`: video plays, all links resolve, no secret on screen.

---

## Task 11 (CHECKPOINT): File the BUIDL

- [ ] **Step 1: Verify the DoraHacks Video field** accepts a self-hosted URL (SPA → Chrome MCP + RECTOR's login). If it hard-requires a platform embed → add a **Vimeo unlisted** mirror and use that URL for the Video field (keep `/pitch` as Website).
- [ ] **Step 2: Update the submission docs**

`docs/BUIDL.md` (~line 55) + `docs/BUIDL-submission.md` (Video field → URL; Website → `https://praeco.rectorspace.com/pitch`). Commit (`docs(demo): add demo video URL to submission`).

- [ ] **Step 3: Re-confirm the deadline countdown** on the live DoraHacks page (target 2026-07-12 16:00).
- [ ] **Step 4: File** per `docs/BUIDL-submission.md` checklist (Name · Logo · Cover · Tagline · Tags · Description = `BUIDL.md` body + on-chain block · Video · Website=`/pitch` · GitHub; track = Creator & Content Ops). Preview → confirm markdown + links + images. **Submit.** Screenshot the confirmation.
- [ ] **Step 5: Update memory + handoff** — BUIDL filed (+ DoraHacks URL).

---

## Self-Review (against the spec)

- **Spec coverage:** §2 script → Tasks 7/8 (voice + per-beat copy). §3 audio pipeline → Tasks 2 (TTS), 7 (audition), 8 (fit-gen). §4 recording protocol → Tasks 3 (validate) + 8 (record). §5 compile → Task 4 + 9. §6 `/pitch` → Task 6. §7 Blob hosting → Tasks 5 + 10. §8 wiring → Tasks 10/11. §9 sequencing → task order. §10 testing → green gates in Tasks 1/2/4/6/10. §11 risks → Task 11 (video-field fallback), Task 8 (frame validation), Task 9 (integrity QA). **No gaps.**
- **Placeholder scan:** all code steps carry full code; the one deferred value (`PITCH_VIDEO_URL = ""`) is intentional state, wired in Task 10, and its test is written to be stable across the transition. No TBD/TODO.
- **Type consistency:** `computeFit`/`FitPlan` defined in Task 1, consumed unchanged in Task 4; `estimateChars` (Task 1) referenced in Task 8; `parseArgs`/`estimateCredits`/`buildTtsUrl` (Task 2) match their tests; `PROOF`/`PITCH_VIDEO_URL` (Task 6 content) match the page + test.

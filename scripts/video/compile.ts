import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
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
    if (plan.action === "retrim") {
      throw new Error(`beat ${c.beat}: narration is >8% too long — shorten the copy and regenerate`);
    }
    const proc = `video/proc/${c.beat}.mp4`;
    // Everything in ONE -filter_complex (mixing -vf with -filter_complex errors).
    // Fit any aspect into a uniform 1920x1080/30fps frame with a blurred-zoom background
    // fill (a centered sharp copy over a scaled+blurred copy of itself) instead of black
    // bars — looks intentional for non-16:9 window captures, and the identical output size
    // lets the final concat `-c copy`. SAR 1:1 so /pitch's 16:9 <video> never distorts.
    const vGraph =
      "[0:v]split[bg][fg];" +
      "[bg]scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080,gblur=sigma=24[bg];" +
      "[fg]scale=1920:1080:force_original_aspect_ratio=decrease[fg];" +
      "[bg][fg]overlay=(W-w)/2:(H-h)/2,setsar=1,format=yuv420p,fps=30[v]";
    execFileSync("ffmpeg", [
      "-y", "-i", c.video, "-i", c.audio,
      "-filter_complex", `${vGraph};[1:a]${audioFilter(plan)}[a]`,
      "-map", "[v]", "-map", "[a]",
      "-c:v", "libx264", "-preset", "medium", "-crf", "21",
      // ElevenLabs narration is mono — force stereo so it plays centered, not left-only.
      "-c:a", "aac", "-b:a", "160k", "-ar", "48000", "-ac", "2",
      "-shortest", proc,
    ], { stdio: "inherit" });
    procList.push(proc);
    console.log(`✓ beat ${c.beat} → ${proc} (${plan.action})`);
  }

  // Book-end with the intro/outro bumpers when present (video/bumpers/*.mp4), then concat.
  // Re-encode rather than -c copy: the bumpers come from a different source than the muxed
  // chunks, so copy would be fragile on timebase/params. Absolute paths so the concat
  // demuxer resolves them regardless of the list file's location.
  const segments = [
    ...(existsSync("video/bumpers/intro.mp4") ? ["video/bumpers/intro.mp4"] : []),
    ...procList,
    ...(existsSync("video/bumpers/outro.mp4") ? ["video/bumpers/outro.mp4"] : []),
  ];
  const listPath = "video/proc/concat.txt";
  writeFileSync(listPath, segments.map((p) => `file '${resolve(p)}'`).join("\n"));
  execFileSync("ffmpeg", [
    "-y", "-f", "concat", "-safe", "0", "-i", listPath,
    "-c:v", "libx264", "-preset", "medium", "-crf", "21",
    "-c:a", "aac", "-b:a", "160k", "-ar", "48000", "-ac", "2",
    "-movflags", "+faststart", "video/out/praeco-demo.mp4",
  ], { stdio: "inherit" });
  console.log(`✓ video/out/praeco-demo.mp4 (${segments.length} segments: intro + ${procList.length} chunks + outro)`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try { main(); } catch (e) { console.error(e instanceof Error ? e.message : e); process.exit(1); }
}

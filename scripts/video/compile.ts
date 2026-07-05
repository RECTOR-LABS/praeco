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
    if (plan.action === "retrim") {
      throw new Error(`beat ${c.beat}: narration is >8% too long — shorten the copy and regenerate`);
    }
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

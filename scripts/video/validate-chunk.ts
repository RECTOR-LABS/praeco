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

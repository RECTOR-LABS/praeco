// Render the demo intro/outro bumpers from their tracked SVG sources
// (assets/bumpers/*.svg) into 1920x1080 mp4 clips (video/bumpers/*.mp4) that
// compile.ts book-ends the demo with. Deps: rsvg-convert + ffmpeg. $0, offline.
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";

// Encode params must match compile.ts's per-chunk output so the final concat stays uniform.
const V = ["-c:v", "libx264", "-preset", "medium", "-crf", "21", "-pix_fmt", "yuv420p"];
const A = ["-c:a", "aac", "-b:a", "160k", "-ar", "48000"];

interface Bumper { name: string; seconds: number; fade: string }
const BUMPERS: Bumper[] = [
  { name: "intro", seconds: 2.5, fade: "fade=t=in:st=0:d=0.6" },
  { name: "outro", seconds: 3.0, fade: "fade=t=out:st=2.2:d=0.8" },
];

function render(b: Bumper) {
  const svg = `assets/bumpers/${b.name}.svg`;
  const png = `video/bumpers/${b.name}.png`;
  const mp4 = `video/bumpers/${b.name}.mp4`;
  execFileSync("rsvg-convert", ["-w", "1920", "-h", "1080", svg, "-o", png]);
  execFileSync("ffmpeg", [
    "-y", "-loglevel", "error",
    "-loop", "1", "-framerate", "30", "-i", png,
    "-f", "lavfi", "-i", "anullsrc=channel_layout=stereo:sample_rate=48000",
    "-t", String(b.seconds),
    "-vf", `${b.fade},setsar=1,format=yuv420p`,
    ...V, ...A, "-shortest", mp4,
  ]);
  console.log(`✓ ${mp4} (${b.seconds}s)`);
}

function main() {
  mkdirSync("video/bumpers", { recursive: true });
  for (const b of BUMPERS) render(b);
}

try {
  main();
} catch (e) {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
}

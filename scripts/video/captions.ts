import "dotenv/config";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { basename } from "node:path";
import { parseManifest } from "./compile";
import { parseForcedAlignment, groupWords, padShortCues, toSrt } from "./lib/captions";

// ElevenLabs forced-alignment: POST an existing narration mp3 + its transcript,
// get word-level timings back — no re-synthesis, so the approved audio is
// untouched. Word timings → readable cues → per-beat SRT that compile.ts burns.
const ALIGN_URL = "https://api.elevenlabs.io/v1/forced-alignment";

// Minimum on-screen seconds per cue, so a short tail (e.g. a one-word line)
// stays readable instead of flashing by.
const MIN_CUE_SEC = 1.2;

async function alignBeat(audioPath: string, text: string, apiKey: string) {
  const audio = readFileSync(audioPath);
  const form = new FormData();
  form.append("file", new Blob([audio], { type: "audio/mpeg" }), basename(audioPath));
  form.append("text", text);
  const res = await fetch(ALIGN_URL, {
    method: "POST",
    headers: { "xi-api-key": apiKey },
    body: form,
  });
  if (!res.ok) {
    throw new Error(`ElevenLabs forced-alignment ${res.status}: ${await res.text()}`);
  }
  return parseForcedAlignment(await res.json());
}

async function main() {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    throw new Error("ELEVENLABS_API_KEY not set (shell env / ~/Documents/secret/.env)");
  }

  const manifest = parseManifest(readFileSync("video/manifest.json", "utf8"));
  const only = process.argv.slice(2).find((a) => !a.startsWith("--"));
  const beats = only ? manifest.filter((c) => c.beat === only) : manifest;
  if (beats.length === 0) throw new Error(`no beat matching "${only}" in the manifest`);

  mkdirSync("video/captions", { recursive: true });
  for (const c of beats) {
    const text = readFileSync(`video/narration/${c.beat}.txt`, "utf8").trim();
    const words = await alignBeat(c.audio, text, apiKey);
    const cues = padShortCues(groupWords(words), MIN_CUE_SEC);
    writeFileSync(`video/captions/${c.beat}.srt`, toSrt(cues));
    writeFileSync(`video/captions/${c.beat}.json`, JSON.stringify(cues, null, 2));
    console.log(`✓ ${c.beat}: ${cues.length} cues from ${words.length} words`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
}

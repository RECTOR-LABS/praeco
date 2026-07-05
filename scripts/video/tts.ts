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

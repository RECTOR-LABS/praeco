export interface Word {
  text: string;
  start: number;
  end: number;
}

export interface Cue {
  start: number;
  end: number;
  text: string;
}

export interface GroupOpts {
  maxChars?: number;
  maxDurationSec?: number;
  maxGapSec?: number;
}

/**
 * Fold word-level timings into readable caption cues. A cue closes when adding
 * the next word would exceed the character or duration cap, when a pause longer
 * than maxGapSec separates it, or right after a sentence-ending word.
 */
export function groupWords(words: Word[], opts: GroupOpts = {}): Cue[] {
  const maxChars = opts.maxChars ?? 42;
  const maxDurationSec = opts.maxDurationSec ?? 6;
  const maxGapSec = opts.maxGapSec ?? 0.8;

  const cues: Cue[] = [];
  let current: Word[] = [];

  const flush = () => {
    if (current.length === 0) return;
    cues.push({
      start: current[0].start,
      end: current[current.length - 1].end,
      text: current.map((w) => w.text).join(" "),
    });
    current = [];
  };

  for (const w of words) {
    if (current.length > 0) {
      const gap = w.start - current[current.length - 1].end;
      const text = current.map((c) => c.text).join(" ") + " " + w.text;
      const duration = w.end - current[0].start;
      if (gap > maxGapSec || text.length > maxChars || duration > maxDurationSec) {
        flush();
      }
    }
    current.push(w);
    if (/[.!?]$/.test(w.text)) flush();
  }
  flush();
  return cues;
}

const CUE_GAP_SEC = 0.04;

/**
 * Extend any cue shorter than minDurationSec so it stays readable, without
 * overlapping the next cue (a small gap is preserved). The final cue may extend
 * freely; compile clips it at the beat's end.
 */
export function padShortCues(cues: Cue[], minDurationSec: number): Cue[] {
  return cues.map((c, i) => {
    const next = cues[i + 1];
    const cap = next ? next.start - CUE_GAP_SEC : Infinity;
    return { ...c, end: Math.max(c.end, Math.min(c.start + minDurationSec, cap)) };
  });
}

export function formatSrtTime(seconds: number): string {
  const total = Math.round(seconds * 1000);
  const ms = total % 1000;
  const s = Math.floor(total / 1000) % 60;
  const m = Math.floor(total / 60000) % 60;
  const h = Math.floor(total / 3600000);
  const p = (n: number, w = 2) => String(n).padStart(w, "0");
  return `${p(h)}:${p(m)}:${p(s)},${p(ms, 3)}`;
}

/**
 * Pull the word list out of an ElevenLabs forced-alignment response, trimming
 * tokenizer whitespace and dropping blank tokens. Throws on a malformed shape
 * so a live API drift surfaces loudly rather than producing silent garbage.
 */
export function parseForcedAlignment(json: unknown): Word[] {
  const words =
    json && typeof json === "object"
      ? (json as { words?: unknown }).words
      : undefined;
  if (!Array.isArray(words)) {
    throw new Error("forced-alignment response has no `words` array");
  }
  const out: Word[] = [];
  for (const w of words) {
    const rec = w as { text?: unknown; start?: unknown; end?: unknown };
    if (
      typeof rec.text !== "string" ||
      typeof rec.start !== "number" ||
      typeof rec.end !== "number"
    ) {
      throw new Error(`forced-alignment word malformed: ${JSON.stringify(w)}`);
    }
    const text = rec.text.trim();
    if (text.length === 0) continue;
    out.push({ text, start: rec.start, end: rec.end });
  }
  return out;
}

export function toSrt(cues: Cue[]): string {
  return cues
    .map(
      (c, i) =>
        `${i + 1}\n${formatSrtTime(c.start)} --> ${formatSrtTime(c.end)}\n${c.text}\n`,
    )
    .join("\n");
}

const XML_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&apos;",
};

export function escapeXml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => XML_ESCAPES[c]);
}

// A single caption line as a transparent 1920x1080 SVG: bold white text with a
// black outline (paint-order:stroke) so it stays legible over any footage, sat
// in the lower third. rsvg-convert rasterizes it to a PNG that compile.ts
// overlays for the cue's time window — no libass needed.
const CAPTION_FONT_SIZE = 42;
const CAPTION_BASELINE_Y = 992;
const CAPTION_STROKE = 5;

export function cueSvg(text: string, width = 1920, height = 1080): string {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">` +
    `<text x="${width / 2}" y="${CAPTION_BASELINE_Y}" text-anchor="middle" ` +
    `font-family="Helvetica, Arial, sans-serif" font-size="${CAPTION_FONT_SIZE}" font-weight="700" ` +
    `fill="#ffffff" stroke="#000000" stroke-width="${CAPTION_STROKE}" ` +
    `paint-order="stroke" stroke-linejoin="round">${escapeXml(text)}</text></svg>`
  );
}

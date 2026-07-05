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

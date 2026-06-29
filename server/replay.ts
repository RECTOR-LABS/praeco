import type { RunRecord, WorklogEvent } from "@/src/types";
import type { SseEvent } from "./types.js";

const MIN = 120, MAX = 1500;
export function replayDelays(worklog: WorklogEvent[], speed: "1" | "4" | "max"): number[] {
  return worklog.map((e, i) => {
    if (i === 0) return 0;
    if (speed === "max") return 0;
    const raw = e.at - worklog[i - 1].at;
    const clamped = Math.min(MAX, Math.max(MIN, raw));
    return speed === "4" ? Math.round(clamped / 4) : clamped;
  });
}
export async function* replayStream(
  rec: RunRecord, speed: "1" | "4" | "max", sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
): AsyncGenerator<SseEvent> {
  const delays = replayDelays(rec.worklog, speed);
  for (let i = 0; i < rec.worklog.length; i++) {
    if (delays[i] > 0) await sleep(delays[i]);
    const data = rec.worklog[i];
    yield { id: i + 1, event: data.kind, data };
  }
}

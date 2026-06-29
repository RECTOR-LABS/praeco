import type { RunRecord, WorklogEvent } from "@/src/types";
import type { RunMode, SseEvent } from "./types.js";
import { saveRecord } from "./persistence.js";

export interface ActiveRun {
  runId: string; mode: RunMode; status: "running" | "done" | "error";
  buffer: SseEvent[]; record?: RunRecord; subscribers: Set<(e: SseEvent) => void>; nextId: number;
}

export class RunHub {
  private runs = new Map<string, ActiveRun>();
  create(runId: string, mode: RunMode): ActiveRun {
    const r: ActiveRun = { runId, mode, status: "running", buffer: [], subscribers: new Set(), nextId: 0 };
    this.runs.set(runId, r); return r;
  }
  get(runId: string): ActiveRun | undefined { return this.runs.get(runId); }
  publish(runId: string, data: WorklogEvent): void {
    const r = this.runs.get(runId); if (!r) return;
    const e: SseEvent = { id: ++r.nextId, event: data.kind, data };
    r.buffer.push(e);
    for (const fn of r.subscribers) fn(e);
  }
  async finish(runId: string, record: RunRecord): Promise<void> {
    const r = this.runs.get(runId); if (!r) return;
    r.record = record; r.status = "done";
    await saveRecord(record);
    // NOTE: completed runs are NOT yet evicted from `runs` (TTL eviction deferred — spec §4.1).
    // Acceptable at demo scale; revisit before high-throughput use.
  }
  fail(runId: string): void { const r = this.runs.get(runId); if (r) r.status = "error"; }
  subscribe(runId: string, fromEventId: number, fn: (e: SseEvent) => void): () => void {
    const r = this.runs.get(runId); if (!r) return () => {};
    for (const e of r.buffer) if (e.id > fromEventId) fn(e); // catch-up replay
    r.subscribers.add(fn);
    return () => r.subscribers.delete(fn);
  }
}

// Process-wide singleton (survives across requests on Railway's long-lived Node server).
const g = globalThis as unknown as { __praecoHub?: RunHub };
export const hub: RunHub = g.__praecoHub ?? (g.__praecoHub = new RunHub());

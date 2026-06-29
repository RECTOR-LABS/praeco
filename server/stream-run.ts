import type { SseEvent } from "./types.js";
import type { WorklogEventKind } from "@/src/types";
import { hub } from "./run-hub.js";
import { loadRecord } from "./persistence.js";
import { replayStream } from "./replay.js";

const TERMINAL: WorklogEventKind[] = ["run_completed", "run_aborted"];
export function sseFrame(e: SseEvent): string {
  return `id: ${e.id}\nevent: ${e.event}\ndata: ${JSON.stringify(e.data)}\n\n`;
}
export function streamRun(runId: string, opts: { lastEventId?: number; speed?: "1" | "4" | "max" }): ReadableStream<Uint8Array> {
  const enc = new TextEncoder();
  const active = hub.get(runId);
  if (active) {
    let unsub = () => {};
    let terminalFired = false;
    return new ReadableStream<Uint8Array>({
      start(controller) {
        const onEvent = (e: SseEvent) => {
          controller.enqueue(enc.encode(sseFrame(e)));
          if (TERMINAL.includes(e.event)) { terminalFired = true; unsub(); try { controller.close(); } catch {} }
        };
        unsub = hub.subscribe(runId, opts.lastEventId ?? 0, onEvent);
        if (terminalFired || active.status !== "running") { unsub(); try { controller.close(); } catch {} }
      },
      cancel() { unsub(); },
    });
  }
  // No active run → replay from disk (or emit a single error frame).
  let cancelled = false;
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        const rec = await loadRecord(runId);
        if (!rec) {
          controller.enqueue(enc.encode(sseFrame({ id: 1, event: "error", data: { kind: "error", at: Date.now(), message: `no run ${runId}` } })));
          controller.close(); return;
        }
        for await (const e of replayStream(rec, opts.speed ?? "1")) {
          if (cancelled) break;
          controller.enqueue(enc.encode(sseFrame(e)));
        }
        controller.close();
      } catch (err) {
        try { controller.enqueue(enc.encode(sseFrame({ id: 0, event: "error", data: { kind: "error", at: Date.now(), message: `replay failed: ${(err as Error).message}` } }))); } catch {}
        try { controller.close(); } catch {}
      }
    },
    cancel() { cancelled = true; },
  });
}

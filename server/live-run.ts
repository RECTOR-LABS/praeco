/**
 * Single-request live run: execute one launch job INSIDE the SSE response and
 * stream every WorklogEvent as it happens. No hub, no persistence — the engine
 * and its stream are the same request. Serverless-native (fits one function
 * invocation); the run is ephemeral (watch it live, no saved record).
 */
import type { StartRunRequest } from "./types.js";
import type { WorklogEvent } from "@/src/types";
import type { IntakeInput } from "@/src/engine/intake";
import { runLaunchJob } from "@/src/engine/run";
import { buildSandboxDeps } from "./engine-deps.js";

export function liveRunStream(req: StartRunRequest): ReadableStream<Uint8Array> {
  const enc = new TextEncoder();
  const input: IntakeInput = req.repoUrl ? { repoUrl: req.repoUrl } : { text: req.text! };
  const runId = `live-${Date.now()}`;

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      let id = 0;
      const emit = (e: WorklogEvent) => {
        try {
          id++;
          controller.enqueue(enc.encode(`id: ${id}\nevent: ${e.kind}\ndata: ${JSON.stringify(e)}\n\n`));
        } catch { /* client disconnected — engine finishes but nobody's listening */ }
      };
      try {
        // Sandbox deps: real GLM-5.2 reasoning + mock CAP marketplace ($0, no chain).
        await runLaunchJob(input, buildSandboxDeps(emit, runId));
      } catch (err) {
        // runLaunchJob normally emits its own run_aborted; this is a last-resort net.
        emit({ kind: "error", at: Date.now(), message: `run failed: ${(err as Error).message}` });
        emit({ kind: "run_aborted", at: Date.now(), message: `run ${runId} aborted` });
      } finally {
        try { controller.close(); } catch { /* already closed */ }
      }
    },
  });
}

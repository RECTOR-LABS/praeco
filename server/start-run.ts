import type { RunRecord, WorklogEvent } from "@/src/types";
import type { IntakeInput } from "@/src/engine/intake";
import { runLaunchJob } from "@/src/engine/run";
import type { StartRunRequest, StartRunResponse, RunMode } from "./types.js";
import { hub } from "./run-hub.js";
import { assertLiveAllowed, assertCapacity } from "./gating.js";
import { buildSandboxDeps, buildLiveDeps } from "./engine-deps.js";

export type Runner = (runId: string, mode: RunMode, input: IntakeInput, onEvent: (e: WorklogEvent) => void) => Promise<RunRecord>;

const defaultRunner: Runner = async (runId, mode, input, onEvent) => {
  if (mode === "live") {
    const { deps, close } = await buildLiveDeps(onEvent, runId);
    try { return await runLaunchJob(input, deps); } finally { close(); }
  }
  return runLaunchJob(input, buildSandboxDeps(onEvent, runId));
};

export async function startRun(
  req: StartRunRequest,
  headers: Headers,
  opts: { runner?: Runner } = {},
): Promise<StartRunResponse> {
  if (req.mode === "live") assertLiveAllowed(headers);
  assertCapacity(hub.activeCount(req.mode), req.mode);

  const runId = `run-${Date.now()}`;
  hub.create(runId, req.mode);

  const input: IntakeInput = req.repoUrl ? { repoUrl: req.repoUrl } : { text: req.text! };
  const runner = opts.runner ?? defaultRunner;

  // Fire-and-forget: the run continues in this long-lived Node process; SSE reads the hub.
  void runner(runId, req.mode, input, (e) => hub.publish(runId, e))
    .then((rec) => hub.finish(runId, rec))
    .catch((err) => {
      hub.publish(runId, { kind: "error", at: Date.now(), message: `run failed: ${(err as Error).message}` });
      hub.fail(runId);
    });

  return { runId };
}

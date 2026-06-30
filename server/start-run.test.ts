import { it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs"; import { tmpdir } from "node:os"; import { join } from "node:path";
import type { RunRecord } from "@/src/types";
import { startRun } from "./start-run.js";
import { hub } from "./run-hub.js";

let dir: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "praeco-")); process.env.RUNS_DIR = dir; });
afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

it("sandbox start registers a run and publishes events", async () => {
  const fakeRunner = async (runId: string, _m: any, _i: any, onEvent: (e: any) => void): Promise<RunRecord> => {
    onEvent({ kind: "run_started", at: 1, message: "x" });
    return { runId, status: "completed", brief: { product: "P", audience: "A", features: [], tone: "T", oneLiner: "O" }, assets: [], worklog: [{ kind: "run_started", at: 1, message: "x" }], spentBaseUnits: "0", startedAt: 1, endedAt: 2 };
  };
  const { runId } = await startRun({ mode: "sandbox", text: "hello world" }, new Headers(), { runner: fakeRunner });
  await new Promise((r) => setTimeout(r, 10)); // let the fire-and-forget settle
  const run = hub.get(runId)!;
  expect(run.status).toBe("done");
  expect(run.mode).toBe("sandbox");
  expect(run.buffer[0]?.event).toBe("run_started");
});
it("rejects a live start without the token", async () => {
  delete process.env.LIVE_RUN_TOKEN;
  await expect(startRun({ mode: "live", text: "hi there" }, new Headers())).rejects.toMatchObject({ status: 403 });
});
it("publishes an error event and fails the run when the runner rejects", async () => {
  const throwingRunner = async () => { throw new Error("boom"); };
  const { runId } = await startRun({ mode: "sandbox", text: "hello world" }, new Headers(), { runner: throwingRunner });
  await new Promise((r) => setTimeout(r, 10));
  const run = hub.get(runId)!;
  expect(run.status).toBe("error");
  expect(run.buffer.some((e) => e.event === "error")).toBe(true);
  expect(run.buffer.some((e) => e.event === "run_aborted")).toBe(true);
});
it("rejects mode:replay with status 400 (replay is GET-only)", async () => {
  await expect(startRun({ mode: "replay", text: "x" }, new Headers())).rejects.toMatchObject({ status: 400 });
});

import { it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs"; import { tmpdir } from "node:os"; import { join } from "node:path";
import type { RunRecord } from "@/src/types";
import { saveRecord } from "./persistence.js";
import { sseFrame, streamRun } from "./stream-run.js";

let dir: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "praeco-")); process.env.RUNS_DIR = dir; });
afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

it("frames an SSE event", () => {
  expect(sseFrame({ id: 2, event: "hire_paid", data: { kind: "hire_paid", at: 1, message: "m" } }))
    .toBe(`id: 2\nevent: hire_paid\ndata: ${JSON.stringify({ kind: "hire_paid", at: 1, message: "m" })}\n\n`);
});
it("replays a persisted record over SSE then closes", async () => {
  const rec: RunRecord = { runId: "r9", status: "completed", brief: { product: "P", audience: "A", features: [], tone: "T", oneLiner: "O" }, assets: [], worklog: [{ kind: "run_started", at: 1, message: "a" }, { kind: "run_completed", at: 2, message: "b" }], spentBaseUnits: "0", startedAt: 1, endedAt: 2 };
  await saveRecord(rec);
  const text = await new Response(streamRun("r9", { speed: "max" })).text();
  expect(text).toContain("event: run_started");
  expect(text).toContain("event: run_completed");
  expect(text).toContain("id: 1");
  expect(text).toContain('"kind":"run_started"');
});

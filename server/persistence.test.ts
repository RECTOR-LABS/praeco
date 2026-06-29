import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { RunRecord } from "@/src/types";
import { saveRecord, loadRecord } from "./persistence.js";

const rec: RunRecord = {
  runId: "run-test-1", status: "completed", brief: { product: "P", audience: "A", features: [], tone: "T", oneLiner: "O" },
  assets: [], worklog: [{ kind: "run_started", at: 1, message: "x" }], spentBaseUnits: "0", startedAt: 1, endedAt: 2,
};
let dir: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "praeco-")); process.env.RUNS_DIR = dir; });
afterEach(() => { rmSync(dir, { recursive: true, force: true }); delete process.env.RUNS_DIR; });

it("round-trips a RunRecord", async () => {
  await saveRecord(rec);
  expect(await loadRecord("run-test-1")).toEqual(rec);
});
it("returns null for a missing id", async () => {
  expect(await loadRecord("nope")).toBeNull();
});

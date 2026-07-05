import { it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { RunRecord } from "@/src/types";
import { saveRecord, loadRecord, listRecords } from "./persistence.js";
import { listBundledRecords } from "./replays.js";

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

it("returns null (not a bogus record) when a json file lacks a string runId — e.g. reputation.json", async () => {
  writeFileSync(join(dir, "reputation.json"), JSON.stringify({ a1: { accepts: 3, rejects: 0, lastSeen: "t" } }), "utf8");
  expect(await loadRecord("reputation")).toBeNull();
});

it("listRecords skips a non-RunRecord json file (e.g. a reputation store) sharing RUNS_DIR", async () => {
  await saveRecord(rec);
  // src/cap/reputation.ts defaults its store into RUNS_DIR when REPUTATION_FILE is
  // unset — this file must never be mistaken for a RunRecord by the run listing.
  writeFileSync(join(dir, "reputation.json"), JSON.stringify({ a1: { accepts: 3, rejects: 0, lastSeen: "t" } }), "utf8");
  const list = await listRecords();
  const bundledIds = new Set(listBundledRecords().map((r) => r.runId));
  const fsOnly = list.filter((r) => !bundledIds.has(r.runId));
  expect(fsOnly).toEqual([rec]); // only the real record — reputation.json contributed nothing
});

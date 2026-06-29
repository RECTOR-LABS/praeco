import { it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, existsSync } from "node:fs"; import { tmpdir } from "node:os"; import { join } from "node:path";
import type { RunRecord, WorklogEvent } from "@/src/types";
import { RunHub } from "./run-hub.js";

const ev = (kind: WorklogEvent["kind"], message = ""): WorklogEvent => ({ kind, at: 1, message });
let dir: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "praeco-")); process.env.RUNS_DIR = dir; });
afterEach(() => { rmSync(dir, { recursive: true, force: true }); delete process.env.RUNS_DIR; });

it("assigns monotonic ids and fans out live", () => {
  const hub = new RunHub(); hub.create("r1", "sandbox");
  const seen: number[] = [];
  hub.subscribe("r1", 0, (e) => seen.push(e.id));
  hub.publish("r1", ev("run_started")); hub.publish("r1", ev("intake_done"));
  expect(seen).toEqual([1, 2]);
});
it("replays buffered events with id > lastEventId on subscribe", () => {
  const hub = new RunHub(); hub.create("r1", "sandbox");
  hub.publish("r1", ev("run_started")); hub.publish("r1", ev("intake_done"));
  const seen: number[] = [];
  hub.subscribe("r1", 1, (e) => seen.push(e.id)); // resume after id 1
  expect(seen).toEqual([2]);
});
it("finish marks done and persists", async () => {
  const hub = new RunHub(); hub.create("r1", "sandbox");
  const rec: RunRecord = { runId: "r1", status: "completed", brief: { product: "P", audience: "A", features: [], tone: "T", oneLiner: "O" }, assets: [], worklog: [], spentBaseUnits: "0", startedAt: 1, endedAt: 2 };
  await hub.finish("r1", rec);
  expect(hub.get("r1")!.status).toBe("done");
  expect(existsSync(join(process.env.RUNS_DIR!, "r1.json"))).toBe(true);
});
it("activeCount counts running runs by mode, ignores other modes", () => {
  const hub = new RunHub();
  hub.create("s1", "sandbox");
  hub.create("s2", "sandbox");
  expect(hub.activeCount("sandbox")).toBe(2);
  expect(hub.activeCount("live")).toBe(0);
});
it("delivers buffered catch-up then continues with live events (reconnect boundary)", () => {
  const hub = new RunHub(); hub.create("r1", "sandbox");
  hub.publish("r1", ev("run_started"));  // id 1, buffered before subscribe
  const seen: number[] = [];
  hub.subscribe("r1", 0, (e) => seen.push(e.id)); // catch-up id 1
  hub.publish("r1", ev("intake_done")); // id 2, live fan-out
  expect(seen).toEqual([1, 2]); // no gap, no dup at the boundary
});

import { it, expect } from "vitest";
import type { RunRecord, WorklogEvent } from "@/src/types";
import { replayDelays, replayStream } from "./replay.js";

const wl: WorklogEvent[] = [
  { kind: "run_started", at: 1000, message: "a" },
  { kind: "intake_done", at: 1050, message: "b" },   // +50ms -> clamp up to 120
  { kind: "hire_paid", at: 9000, message: "c" },       // +7950ms -> clamp down to 1500
];
it("clamps per-event delays to [120,1500] and zeroes the first", () => {
  expect(replayDelays(wl, "1")).toEqual([0, 120, 1500]);
});
it("speed=4 quarters the delays; max zeroes them", () => {
  expect(replayDelays(wl, "4")).toEqual([0, 30, 375]);
  expect(replayDelays(wl, "max")).toEqual([0, 0, 0]);
});
it("replayStream yields monotonic ids in order", async () => {
  const rec = { worklog: wl } as RunRecord;
  const ids: number[] = []; const kinds: string[] = [];
  for await (const e of replayStream(rec, "max", async () => {})) { ids.push(e.id); kinds.push(e.event); }
  expect(ids).toEqual([1, 2, 3]);
  expect(kinds).toEqual(["run_started", "intake_done", "hire_paid"]);
});

const wl4: WorklogEvent[] = [
  { kind: "run_started", at: 1000, message: "a" },
  { kind: "intake_done", at: 1050, message: "b" },
  { kind: "hire_paid", at: 9000, message: "c" },
  { kind: "run_completed", at: 9010, message: "d" },
];
it("fromEventId skips already-seen events on reconnect", async () => {
  const rec = { worklog: wl4 } as RunRecord;
  const ids: number[] = [];
  for await (const e of replayStream(rec, "max", async () => {}, 2)) { ids.push(e.id); }
  expect(ids).toEqual([3, 4]);
});

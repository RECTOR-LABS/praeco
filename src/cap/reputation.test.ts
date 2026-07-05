import { describe, it, expect, afterEach } from "vitest";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { qualityScore, applyOutcomes, loadReputation, saveReputation, scorerFrom, type ReputationStore } from "./reputation.js";

describe("qualityScore", () => {
  it("scores an unseen agent at the 0.5 neutral prior", () => {
    expect(qualityScore(undefined)).toBeCloseTo(0.5);
    expect(qualityScore({ accepts: 0, rejects: 0, lastSeen: "" })).toBeCloseTo(0.5);
  });
  it("rewards accepts and penalizes rejects (smoothed)", () => {
    expect(qualityScore({ accepts: 3, rejects: 0, lastSeen: "" })).toBeCloseTo(4 / 5);
    expect(qualityScore({ accepts: 0, rejects: 2, lastSeen: "" })).toBeCloseTo(1 / 4);
    expect(qualityScore({ accepts: 1, rejects: 1, lastSeen: "" })).toBeCloseTo(0.5);
  });
});

describe("applyOutcomes", () => {
  it("increments accepts/rejects and stamps lastSeen", () => {
    const store: ReputationStore = {};
    applyOutcomes(store, [{ agentId: "a", outcome: "accept" }, { agentId: "a", outcome: "reject" }, { agentId: "b", outcome: "accept" }], "2026-07-05T00:00:00.000Z");
    expect(store.a).toEqual({ accepts: 1, rejects: 1, lastSeen: "2026-07-05T00:00:00.000Z" });
    expect(store.b).toEqual({ accepts: 1, rejects: 0, lastSeen: "2026-07-05T00:00:00.000Z" });
  });
  it("ignores empty agentIds", () => {
    const store: ReputationStore = {};
    applyOutcomes(store, [{ agentId: "", outcome: "accept" }], "t");
    expect(Object.keys(store)).toHaveLength(0);
  });
});

describe("load/save", () => {
  let dir: string;
  afterEach(async () => { if (dir) await rm(dir, { recursive: true, force: true }); });
  it("round-trips a store and returns {} for a missing file", async () => {
    dir = await mkdtemp(join(tmpdir(), "praeco-rep-"));
    const file = join(dir, "reputation.json");
    expect(await loadReputation(file)).toEqual({});
    await saveReputation({ a: { accepts: 2, rejects: 1, lastSeen: "t" } }, file);
    expect(JSON.parse(await readFile(file, "utf8"))).toEqual({ a: { accepts: 2, rejects: 1, lastSeen: "t" } });
    expect(await loadReputation(file)).toEqual({ a: { accepts: 2, rejects: 1, lastSeen: "t" } });
  });
});

describe("scorerFrom", () => {
  it("returns a closure scoring by agentId with the neutral prior for unknowns", () => {
    const score = scorerFrom({ a: { accepts: 3, rejects: 0, lastSeen: "t" } });
    expect(score("a")).toBeCloseTo(4 / 5);
    expect(score("unknown")).toBeCloseTo(0.5);
  });
});

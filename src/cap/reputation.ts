/**
 * Per-agent reputation from Praeco's OWN QA outcomes — not marketplace-reported
 * popularity. A Bayesian success rate with a neutral (0.5) prior so unseen
 * agents are still tried and earn a record. Best-effort JSON persistence
 * (swallowed on a read-only serverless FS; persists on a long-lived host).
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

export interface RepEntry { accepts: number; rejects: number; lastSeen: string }
export type ReputationStore = Record<string, RepEntry>;
export type QaOutcome = "accept" | "reject";

export function reputationFile(): string {
  return process.env.REPUTATION_FILE ?? join(process.env.RUNS_DIR ?? "./runs", "reputation.json");
}

/** Bayesian success rate with a neutral 0.5 prior. Unseen agent → 0.5. */
export function qualityScore(entry?: RepEntry): number {
  const a = entry?.accepts ?? 0;
  const r = entry?.rejects ?? 0;
  return (a + 1) / (a + r + 2);
}

/** Apply QA outcomes to the store (mutates + returns it). `now` is an ISO string. */
export function applyOutcomes(store: ReputationStore, outcomes: { agentId: string; outcome: QaOutcome }[], now: string): ReputationStore {
  for (const { agentId, outcome } of outcomes) {
    if (!agentId) continue;
    const e = store[agentId] ?? { accepts: 0, rejects: 0, lastSeen: now };
    if (outcome === "accept") e.accepts += 1; else e.rejects += 1;
    e.lastSeen = now;
    store[agentId] = e;
  }
  return store;
}

/** Best-effort load — {} when absent/unreadable (serverless ephemeral FS). */
export async function loadReputation(file = reputationFile()): Promise<ReputationStore> {
  try {
    const parsed = JSON.parse(await readFile(file, "utf8"));
    return parsed && typeof parsed === "object" ? (parsed as ReputationStore) : {};
  } catch { return {}; }
}

/** Best-effort save — swallowed on a read-only FS (serverless). */
export async function saveReputation(store: ReputationStore, file = reputationFile()): Promise<void> {
  try {
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, JSON.stringify(store, null, 2), "utf8");
  } catch { /* read-only FS (serverless) — reputation is ephemeral there */ }
}

/** A scorer closure over a loaded store — for discoverForLeg's qualityScoreOf. */
export function scorerFrom(store: ReputationStore): (agentId: string) => number {
  return (agentId: string) => qualityScore(store[agentId]);
}

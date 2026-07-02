// Flagship RunRecords bundled into the deploy so replay works on serverless (no
// writable volume). These are the shareable demo runs the landing lists and the
// Theater plays back. To add/refresh a replay: drop a RunRecord JSON in replays/
// and import it here. Real on-chain-provenance records supersede these when captured.
import type { RunRecord } from "@/src/types";
import r1 from "@/replays/run-1782628352055.json";
import r2 from "@/replays/run-1782634131276.json";
import r3 from "@/replays/run-1782579551408.json";

const BUNDLED: RunRecord[] = [r1, r2, r3] as unknown as RunRecord[];

export function getBundledRecord(runId: string): RunRecord | null {
  return BUNDLED.find((r) => r.runId === runId) ?? null;
}

export function listBundledRecords(): RunRecord[] {
  return [...BUNDLED].sort((a, b) => b.startedAt - a.startedAt);
}

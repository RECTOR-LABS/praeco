import { mkdir, readFile, writeFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import type { RunRecord } from "@/src/types";

export function runsDir(): string { return process.env.RUNS_DIR ?? "./runs"; }

export async function saveRecord(rec: RunRecord): Promise<void> {
  await mkdir(runsDir(), { recursive: true });
  await writeFile(join(runsDir(), `${rec.runId}.json`), JSON.stringify(rec, null, 2), "utf8");
}
export async function loadRecord(runId: string): Promise<RunRecord | null> {
  // Guard against path traversal: only a bare runId is addressable.
  if (!/^[\w.-]+$/.test(runId)) return null;
  try { return JSON.parse(await readFile(join(runsDir(), `${runId}.json`), "utf8")) as RunRecord; }
  catch { return null; }
}
export async function listRecords(): Promise<RunRecord[]> {
  let names: string[] = [];
  try { names = (await readdir(runsDir())).filter((n) => n.endsWith(".json")); } catch { return []; }
  const recs = await Promise.all(names.map((n) => loadRecord(n.replace(/\.json$/, ""))));
  return recs.filter((r): r is RunRecord => r !== null).sort((a, b) => b.startedAt - a.startedAt);
}

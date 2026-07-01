import { mkdir, readFile, writeFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import type { RunRecord } from "@/src/types";
import { getBundledRecord, listBundledRecords } from "./replays.js";

export function runsDir(): string { return process.env.RUNS_DIR ?? "./runs"; }

// On a serverless deploy there is no writable volume; writes are best-effort and
// swallowed. Persisted demo runs ship bundled (server/replays.ts); new sandbox/live
// runs are ephemeral there. On Railway / local this still writes to RUNS_DIR.
export async function saveRecord(rec: RunRecord): Promise<void> {
  try {
    await mkdir(runsDir(), { recursive: true });
    await writeFile(join(runsDir(), `${rec.runId}.json`), JSON.stringify(rec, null, 2), "utf8");
  } catch { /* read-only FS (serverless) — records are bundled, not written */ }
}

async function loadFromFs(runId: string): Promise<RunRecord | null> {
  // Guard against path traversal: only a bare runId is addressable.
  if (!/^[\w.-]+$/.test(runId)) return null;
  try { return JSON.parse(await readFile(join(runsDir(), `${runId}.json`), "utf8")) as RunRecord; }
  catch { return null; }
}

export async function loadRecord(runId: string): Promise<RunRecord | null> {
  // Bundled demo records first (work everywhere), then the local/Railway volume.
  return getBundledRecord(runId) ?? (await loadFromFs(runId));
}

export async function listRecords(): Promise<RunRecord[]> {
  let fsRecs: RunRecord[] = [];
  try {
    const names = (await readdir(runsDir())).filter((n) => n.endsWith(".json"));
    fsRecs = (await Promise.all(names.map((n) => loadFromFs(n.replace(/\.json$/, "")))))
      .filter((r): r is RunRecord => r !== null);
  } catch { /* no runs dir (serverless) — bundled records carry the list */ }
  // Merge fs + bundled, dedup by runId (bundled wins), newest first.
  const byId = new Map<string, RunRecord>();
  for (const r of [...fsRecs, ...listBundledRecords()]) byId.set(r.runId, r);
  return [...byId.values()].sort((a, b) => b.startedAt - a.startedAt);
}

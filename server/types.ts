import type { WorklogEvent, WorklogEventKind } from "@/src/types";
export type RunMode = "replay" | "sandbox" | "live";
export interface SseEvent { id: number; event: WorklogEventKind; data: WorklogEvent; }
export interface StartRunRequest { mode: RunMode; text?: string; repoUrl?: string; }
export interface StartRunResponse { runId: string; }

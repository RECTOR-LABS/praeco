import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import type { StartRunRequest, RunMode } from "./types.js";

export class GateError extends Error { constructor(message: string, readonly status: number) { super(message); } }

const schema = z.object({
  mode: z.enum(["replay", "sandbox", "live"]),
  text: z.string().trim().min(3).max(2000).optional(),
  repoUrl: z.string().trim().regex(/^https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/?$/, "must be a https://github.com/owner/repo URL").optional(),
}).refine((v) => v.text || v.repoUrl, { message: "provide text or repoUrl" });

export function parseStartRequest(body: unknown): StartRunRequest {
  const r = schema.safeParse(body);
  if (!r.success) throw new GateError(r.error.issues[0]?.message ?? "invalid request", 400);
  return r.data;
}
export function assertLiveAllowed(headers: Headers): void {
  const token = process.env.LIVE_RUN_TOKEN;
  if (!token) throw new GateError("live runs are disabled", 403);
  const provided = Buffer.from(headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${token}`);
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected))
    throw new GateError("forbidden", 403);
}
const CAPS: Record<RunMode, number> = { live: 1, sandbox: 3, replay: 999 };
export function assertCapacity(activeCount: number, mode: RunMode): void {
  if (activeCount >= CAPS[mode]) throw new GateError(`too many concurrent ${mode} runs`, 429);
}

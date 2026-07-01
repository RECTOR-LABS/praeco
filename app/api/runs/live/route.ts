import type { NextRequest } from "next/server";
import { liveRunStream } from "@/server/live-run";
import { parseStartRequest, GateError } from "@/server/gating";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

// GET /api/runs/live?mode=sandbox&text=...  (or &repoUrl=...)
// Runs one sandbox launch job and streams its events over SSE, in this single
// request. Only sandbox is available here — live (real USDC) needs the gated backend.
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const mode = url.searchParams.get("mode") ?? "sandbox";
  const text = url.searchParams.get("text") ?? undefined;
  const repoUrl = url.searchParams.get("repoUrl") ?? undefined;

  const errorFrame = (message: string) =>
    new Response(`event: error\ndata: ${JSON.stringify({ kind: "error", at: Date.now(), message })}\n\n`, {
      headers: { "content-type": "text/event-stream", "cache-control": "no-cache, no-transform" },
    });

  try {
    if (mode !== "sandbox") throw new GateError("Only free sandbox runs are available on this deployment.", 400);
    const body = parseStartRequest({ mode, text, repoUrl });
    return new Response(liveRunStream(body), {
      headers: { "content-type": "text/event-stream", "cache-control": "no-cache, no-transform", connection: "keep-alive" },
    });
  } catch (e) {
    return errorFrame(e instanceof GateError ? e.message : (e as Error).message);
  }
}

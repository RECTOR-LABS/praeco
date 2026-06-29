import type { NextRequest } from "next/server";
import { streamRun } from "@/server/stream-run";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const url = new URL(req.url);
  const speedParam = url.searchParams.get("speed");
  const speed = speedParam === "4" || speedParam === "max" ? speedParam : "1";
  const lastId = Number(req.headers.get("last-event-id") ?? url.searchParams.get("lastEventId") ?? 0) || 0;
  return new Response(streamRun(id, { lastEventId: lastId, speed }), {
    headers: { "content-type": "text/event-stream", "cache-control": "no-cache, no-transform", connection: "keep-alive" },
  });
}

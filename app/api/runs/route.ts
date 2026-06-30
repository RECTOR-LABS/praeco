import { NextRequest, NextResponse } from "next/server";
import { parseStartRequest, GateError } from "@/server/gating";
import { startRun } from "@/server/start-run";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    let raw: unknown;
    try { raw = await req.json(); }
    catch { return NextResponse.json({ error: "invalid JSON body" }, { status: 400 }); }
    const body = parseStartRequest(raw);
    const res = await startRun(body, req.headers);
    return NextResponse.json(res);
  } catch (e) {
    if (e instanceof GateError) return NextResponse.json({ error: e.message }, { status: e.status });
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

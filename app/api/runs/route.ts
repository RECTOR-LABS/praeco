import { NextRequest, NextResponse } from "next/server";
import { parseStartRequest, GateError } from "@/server/gating";
import { startRun } from "@/server/start-run";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = parseStartRequest(await req.json());
    const res = await startRun(body, req.headers);
    return NextResponse.json(res);
  } catch (e) {
    if (e instanceof GateError) return NextResponse.json({ error: e.message }, { status: e.status });
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

import type { WorklogEvent, LegKind } from "@/src/types";
import { REQUIRED_LEGS, baseUnitsToUsd } from "@/src/constants";

export type Phase = "idle" | "searching" | "candidate" | "negotiating" | "ordered" | "paid" | "delivered" | "accepted" | "blocked";
export interface LaneState { leg: LegKind; phase: Phase; agentName?: string; amountUsd?: string; basescanUrl?: string; note?: string; }
export interface LedgerEntry { agentName: string; amountUsd: string; basescanUrl: string; }
export interface TheaterState {
  status: "running" | "completed" | "partial" | "aborted" | "failed";
  lanes: Record<LegKind, LaneState>; ledger: LedgerEntry[]; thinking: string[];
  spentUsd: string; product?: string; startedAt?: number; endedAt?: number;
}
export function initialTheaterState(): TheaterState {
  const lanes = Object.fromEntries(REQUIRED_LEGS.map((leg) => [leg, { leg, phase: "idle" as Phase }])) as Record<LegKind, LaneState>;
  return { status: "running", lanes, ledger: [], thinking: [], spentUsd: "0.00" };
}
// Events whose only effect is to advance the lane rail (no money/agent extraction).
const PHASE: Partial<Record<WorklogEvent["kind"], Phase>> = {
  leg_search: "searching", leg_candidate: "candidate", hire_delivered: "delivered",
};
const usd = (base: string) => { try { return baseUnitsToUsd(BigInt(base)); } catch { return "0.00"; } };
const sumUsd = (l: LedgerEntry[]) => (l.reduce((a, e) => a + Math.round(Number(e.amountUsd) * 100), 0) / 100).toFixed(2);
// agentName is NOT in event.data; the engine puts it in the hire_negotiating message
// ("negotiating <Agent> (<serviceId>)"). Parse once and carry it on the lane.
const agentFromNegotiating = (msg: string): string | undefined => msg.match(/negotiating (.+?) \(/)?.[1];

export function theaterReducer(s: TheaterState, e: WorklogEvent): TheaterState {
  const d = (e.data ?? {}) as Record<string, unknown>;
  if (e.kind === "run_started") return { ...s, startedAt: e.at };
  if (e.kind === "intake_done") return { ...s, product: (d.oneLiner as string) ?? s.product };
  if (e.kind === "agent_step") return d.tool ? s : { ...s, thinking: [...s.thinking, e.message] };
  if (e.kind === "run_completed") return { ...s, status: "completed", endedAt: e.at };
  if (e.kind === "run_aborted") return { ...s, status: s.status === "failed" ? "failed" : (s.ledger.length ? "partial" : "aborted"), endedAt: e.at };
  if (e.kind === "error" && e.leg == null) return { ...s, status: s.status === "running" ? "failed" : s.status };

  const leg = e.leg as LegKind | undefined;
  if (!leg || !(leg in s.lanes)) return s; // no-leg events (e.g. compose_started) don't touch lanes
  const lane: LaneState = { ...s.lanes[leg] };
  let ledger = s.ledger;

  switch (e.kind) {
    case "hire_negotiating":
      lane.phase = "negotiating";
      lane.agentName = agentFromNegotiating(e.message) ?? lane.agentName;
      break;
    case "hire_order_created": // data: { orderId, price } — price in USDC base units
      lane.phase = "ordered";
      if (typeof d.price === "string") lane.amountUsd = usd(d.price);
      break;
    case "hire_paid": // data: { orderId, payTxHash } — build the receipt from the tx hash
      lane.phase = "paid";
      if (typeof d.payTxHash === "string") lane.basescanUrl = `https://basescan.org/tx/${d.payTxHash}`;
      if (lane.agentName && lane.amountUsd && lane.basescanUrl && !s.ledger.some((e) => e.basescanUrl === lane.basescanUrl))
        ledger = [...s.ledger, { agentName: lane.agentName, amountUsd: lane.amountUsd, basescanUrl: lane.basescanUrl }];
      break;
    case "qa_verdict": { // data: { score }; verdict word is in the message ("QA accept|redo|swap: …")
      if (!e.message.startsWith("QA accept")) lane.phase = "blocked";
      lane.note = e.message.replace(/^QA /, "");
      break;
    }
    case "asset_submitted":
      lane.phase = "accepted";
      break;
    case "hire_blocked":
      lane.phase = "blocked";
      lane.note = e.message;
      break;
    default:
      if (PHASE[e.kind]) lane.phase = PHASE[e.kind]!;
  }
  return { ...s, lanes: { ...s.lanes, [leg]: lane }, ledger, spentUsd: sumUsd(ledger) };
}

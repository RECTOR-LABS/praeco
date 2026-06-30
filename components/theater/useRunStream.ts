"use client";
import { useEffect, useReducer } from "react";
import type { WorklogEvent } from "@/src/types";
import { initialTheaterState, theaterReducer, type TheaterState } from "./reducer";

export function useRunStream(runId: string, opts: { speed?: "1" | "4" | "max" } = {}): TheaterState {
  const [state, dispatch] = useReducer(theaterReducer, undefined, initialTheaterState);
  useEffect(() => {
    const qs = opts.speed ? `?speed=${opts.speed}` : "";
    const es = new EventSource(`/api/runs/${runId}/stream${qs}`);
    const handler = (ev: MessageEvent) => {
      try { dispatch(JSON.parse(ev.data) as WorklogEvent); } catch (err) { console.warn("[theater] dropped malformed SSE event", err); }
    };
    const kinds = [
      "run_started", "intake_done", "leg_search", "leg_candidate",
      "hire_negotiating", "hire_order_created", "hire_paid", "hire_delivered",
      "qa_verdict", "asset_submitted", "hire_blocked", "compose_started",
      "run_completed", "run_aborted", "agent_step", "error",
    ];
    kinds.forEach((k) => es.addEventListener(k, handler));
    es.onerror = () => es.close();
    return () => es.close();
  }, [runId, opts.speed]);
  return state;
}

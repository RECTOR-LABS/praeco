"use client";
import { useEffect, useReducer } from "react";
import type { WorklogEvent } from "@/src/types";
import { initialTheaterState, theaterReducer, type TheaterState } from "./reducer";

const KINDS = [
  "run_started", "intake_done", "leg_search", "leg_candidate",
  "hire_negotiating", "hire_order_created", "hire_paid", "hire_delivered",
  "qa_verdict", "asset_submitted", "hire_blocked", "compose_started",
  "run_completed", "run_aborted", "agent_step", "error",
];

// Opens the single-request live run stream (/api/runs/live?<query>) and folds
// events into Theater state. `query` is the intake querystring (mode + text/repoUrl).
export function useLiveRunStream(query: string): TheaterState {
  const [state, dispatch] = useReducer(theaterReducer, undefined, initialTheaterState);
  useEffect(() => {
    const es = new EventSource(`/api/runs/live?${query}`);
    const handler = (ev: MessageEvent) => {
      try { dispatch(JSON.parse(ev.data) as WorklogEvent); }
      catch (err) { console.warn("[theater] dropped malformed SSE event", err); }
    };
    KINDS.forEach((k) => es.addEventListener(k, handler));
    // The server closes the stream when the run ends; onerror then fires — close so
    // EventSource does NOT auto-reconnect and re-run the (paid-in-tokens) engine.
    es.onerror = () => es.close();
    return () => es.close();
  }, [query]);
  return state;
}

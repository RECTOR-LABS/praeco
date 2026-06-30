"use client";
import { useRunStream } from "./useRunStream";
import { Theater } from "./Theater";

export function TheaterStream({ runId, speed }: { runId: string; speed?: "1" | "4" | "max" }) {
  const state = useRunStream(runId, speed ? { speed } : {});
  return <Theater state={state} />;
}

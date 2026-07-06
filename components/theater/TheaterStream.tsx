"use client";
import type { LaunchKit } from "@/src/types";
import { useRunStream } from "./useRunStream";
import { Theater } from "./Theater";
import { KitView } from "@/components/KitView";

export function TheaterStream({
  runId,
  speed,
  kit,
  spentUsd,
}: {
  runId: string;
  speed?: "1" | "4" | "max";
  kit?: LaunchKit;
  spentUsd?: string;
}) {
  const state = useRunStream(runId, speed ? { speed } : {});
  return (
    <>
      <Theater state={state} />
      {/* Gate the finished kit on completion so it never shows below a still-"RUNNING"
          Theater (the temporal-mismatch bug). Hit Skip to jump straight to it. */}
      {kit && state.status !== "running" && <KitView kit={kit} spentUsd={spentUsd} />}
    </>
  );
}

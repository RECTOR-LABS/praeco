"use client";
import { useState } from "react";
import type { LaunchKit } from "@/src/types";
import { TheaterStream } from "@/components/theater/TheaterStream";

type Speed = "1" | "4" | "max";

const SPEED_LABELS: Record<Speed, string> = { "1": "1×", "4": "4×", max: "Skip" };

export function ReplayStage({ runId, kit, spentUsd }: { runId: string; kit?: LaunchKit; spentUsd?: string }) {
  const [speed, setSpeed] = useState<Speed>("1");

  return (
    <div>
      <div className="mx-auto flex max-w-5xl items-center gap-2 px-4 pb-2 pt-4">
        <span className="mr-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Speed</span>
        {(["1", "4", "max"] as Speed[]).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setSpeed(s)}
            className={`rounded px-3 py-1 font-mono text-xs transition-colors ${
              s === speed
                ? "bg-live/15 text-live"
                : "border border-line text-muted-foreground hover:bg-panel-2"
            }`}
          >
            {SPEED_LABELS[s]}
          </button>
        ))}
      </div>
      <TheaterStream key={speed} runId={runId} speed={speed} kit={kit} spentUsd={spentUsd} />
    </div>
  );
}

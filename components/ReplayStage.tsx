"use client";
import { useState } from "react";
import { useRunStream } from "@/components/theater/useRunStream";
import { Theater } from "@/components/theater/Theater";

type Speed = "1" | "4" | "max";

const SPEED_LABELS: Record<Speed, string> = { "1": "1×", "4": "4×", max: "Skip" };

export function ReplayStage({ runId }: { runId: string }) {
  const [speed, setSpeed] = useState<Speed>("1");
  const state = useRunStream(runId, { speed });

  return (
    <div>
      <div className="flex items-center gap-2 px-4 pt-4 pb-2">
        <span className="text-xs font-medium text-gray-500 mr-1">Speed:</span>
        {(["1", "4", "max"] as Speed[]).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setSpeed(s)}
            className={`rounded px-3 py-1 text-xs font-medium transition-colors ${
              s === speed
                ? "bg-emerald-600 text-white"
                : "bg-white/10 text-gray-400 hover:bg-white/20"
            }`}
          >
            {SPEED_LABELS[s]}
          </button>
        ))}
      </div>
      <Theater state={state} />
    </div>
  );
}

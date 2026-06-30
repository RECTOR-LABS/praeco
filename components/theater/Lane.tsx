import type { LaneState, Phase } from "./reducer";
import { CheckCircle2, AlertCircle, ExternalLink, User } from "lucide-react";
import { cn } from "@/lib/utils";

const LEG_LABEL: Record<string, string> = {
  research:     "Research",
  landing_copy: "Landing copy",
  og_image:     "OG image",
};

// Ordered phase progression (blocked is a side-state, not in the rail).
const RAIL: Phase[] = [
  "idle", "searching", "candidate", "negotiating",
  "ordered", "paid", "delivered", "accepted",
];

const PHASE_LABEL: Record<Phase, string> = {
  idle:        "Idle",
  searching:   "Searching",
  candidate:   "Candidate",
  negotiating: "Negotiating",
  ordered:     "Ordered",
  paid:        "Paid",
  delivered:   "Delivered",
  accepted:    "Accepted",
  blocked:     "Blocked",
};

function PhaseRail({ phase }: { phase: Phase }) {
  const currentIdx = RAIL.indexOf(phase);
  const isBlocked = phase === "blocked";
  return (
    <div className="flex gap-0.5">
      {RAIL.map((step, i) => (
        <div
          key={step}
          className={cn(
            "h-1 flex-1 rounded-full",
            isBlocked
              ? "bg-red-500/60"
              : i <= currentIdx
              ? "bg-emerald-500"
              : "bg-white/10",
          )}
        />
      ))}
    </div>
  );
}

export function Lane({ lane }: { lane: LaneState }) {
  const isBlocked = lane.phase === "blocked";
  const isAccepted = lane.phase === "accepted";
  return (
    <div
      className={cn(
        "rounded-xl border p-4 space-y-3",
        isBlocked
          ? "border-red-500/30 bg-red-500/5"
          : "border-white/10 bg-white/5",
      )}
    >
      {/* Header: label + phase badge */}
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-semibold text-white">
          {LEG_LABEL[lane.leg] ?? lane.leg}
        </span>
        <span
          className={cn(
            "shrink-0 rounded-full px-2 py-0.5 text-xs font-medium",
            isBlocked
              ? "bg-red-500/20 text-red-400"
              : isAccepted
              ? "bg-emerald-500/20 text-emerald-400"
              : "bg-white/10 text-gray-400",
          )}
        >
          {PHASE_LABEL[lane.phase]}
        </span>
      </div>

      {/* Phase progress rail */}
      <PhaseRail phase={lane.phase} />

      {/* Agent name */}
      {lane.agentName && (
        <div className="flex items-center gap-1.5 text-sm text-gray-300">
          <User className="h-3.5 w-3.5 shrink-0 text-gray-500" />
          {lane.agentName}
        </div>
      )}

      {/* Blocked note */}
      {isBlocked && lane.note && (
        <div className="flex items-start gap-2 rounded-lg bg-red-500/10 px-3 py-2">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-400" />
          <p className="text-xs leading-relaxed text-red-300">{lane.note}</p>
        </div>
      )}

      {/* In-lane Basescan receipt chip */}
      {lane.basescanUrl && (
        <a
          href={lane.basescanUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 rounded-md border border-emerald-500/20 bg-emerald-500/10 px-2 py-1 text-xs text-emerald-400 transition-colors hover:bg-emerald-500/20"
        >
          <CheckCircle2 className="h-3 w-3" />
          Receipt
          <ExternalLink className="h-3 w-3" />
        </a>
      )}
    </div>
  );
}

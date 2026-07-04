import type { LaneState, Phase } from "./reducer";
import type { LegKind } from "@/src/types";
import { AlertCircle, User } from "lucide-react";
import { ConsolePanel } from "@/components/ui/ConsolePanel";
import { StatusPill } from "@/components/ui/StatusPill";
import { PhaseRail } from "@/components/ui/PhaseRail";
import { ReceiptChip } from "@/components/ui/ReceiptChip";

const LEG_LABEL: Record<string, string> = {
  research:     "Research",
  landing_copy: "Landing copy",
  og_image:     "OG image",
};

const LANE_TONE: Record<LegKind, "research" | "copy" | "image"> = {
  research: "research",
  landing_copy: "copy",
  og_image: "image",
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

export function Lane({ lane }: { lane: LaneState }) {
  const isBlocked = lane.phase === "blocked";
  const isAccepted = lane.phase === "accepted";
  const tone = LANE_TONE[lane.leg];
  return (
    <ConsolePanel tone={isBlocked ? "danger" : tone} glow={lane.phase !== "idle"} className="space-y-3 p-4">
      {/* Header: label + phase badge */}
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-xs uppercase tracking-wider text-ink">
          {LEG_LABEL[lane.leg] ?? lane.leg}
        </span>
        <StatusPill tone={isBlocked ? "danger" : isAccepted ? "live" : tone}>
          {PHASE_LABEL[lane.phase]}
        </StatusPill>
      </div>

      {/* Phase progress rail */}
      <PhaseRail segments={RAIL.length} activeIndex={RAIL.indexOf(lane.phase)} blocked={isBlocked} />

      {/* Agent name */}
      {lane.agentName && (
        <div className="flex items-center gap-1.5 font-mono text-xs text-muted-foreground">
          <User className="h-3.5 w-3.5 shrink-0" />
          {lane.agentName}
        </div>
      )}

      {/* Blocked note */}
      {isBlocked && lane.note && (
        <div className="flex items-start gap-2 rounded-lg border border-danger/20 bg-danger/5 px-3 py-2">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-danger" />
          <p className="text-xs leading-relaxed text-danger">{lane.note}</p>
        </div>
      )}

      {/* In-lane Basescan receipt chip */}
      {lane.basescanUrl && <ReceiptChip href={lane.basescanUrl} label="Receipt" />}
    </ConsolePanel>
  );
}

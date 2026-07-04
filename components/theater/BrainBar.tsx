import type { FC } from "react";
import type { TheaterState } from "./reducer";
import { Activity, Clock, CheckCircle, XCircle, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { ConsolePanel } from "@/components/ui/ConsolePanel";
import { LiveDot } from "@/components/ui/LiveDot";
import { SpendMeter } from "@/components/ui/SpendMeter";

const STATUS_CONFIG = {
  running:   { label: "Running",   color: "text-live",      Icon: Activity },
  completed: { label: "Completed", color: "text-live",      Icon: CheckCircle },
  partial:   { label: "Partial",   color: "text-lane-copy", Icon: AlertCircle },
  aborted:   { label: "Aborted",   color: "text-muted",     Icon: XCircle },
  failed:    { label: "Failed",    color: "text-danger",    Icon: XCircle },
} as const satisfies Record<TheaterState["status"], { label: string; color: string; Icon: FC<{ className?: string }> }>;

function elapsedLabel(startedAt?: number, endedAt?: number): string {
  if (!startedAt) return "—";
  const ms = (endedAt ?? startedAt) - startedAt;
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${s % 60}s`;
}

export function BrainBar({ state }: { state: TheaterState }) {
  const cfg = STATUS_CONFIG[state.status];
  const { Icon } = cfg;
  const running = state.status === "running";
  return (
    <ConsolePanel className="px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          {running && <LiveDot />}
          <Icon className={cn("h-4 w-4", cfg.color)} />
          <span className={cn("font-mono text-xs uppercase tracking-wider", cfg.color)}>{cfg.label}</span>
          {state.product && (
            <span className="ml-1 max-w-xs truncate text-sm text-muted">— {state.product}</span>
          )}
        </div>
        <span className="flex items-center gap-1 font-mono text-xs text-muted">
          <Clock className="h-3.5 w-3.5" />
          {elapsedLabel(state.startedAt, state.endedAt)}
        </span>
      </div>
      <div className="mt-3">
        <SpendMeter spentUsd={state.spentUsd} budgetUsd="2.00" live={running} />
      </div>
    </ConsolePanel>
  );
}

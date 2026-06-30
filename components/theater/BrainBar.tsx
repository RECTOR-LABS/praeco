import type { FC } from "react";
import type { TheaterState } from "./reducer";
import { Activity, Clock, CheckCircle, XCircle, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

const STATUS_CONFIG = {
  running:   { label: "Running",   color: "text-emerald-400", Icon: Activity },
  completed: { label: "Completed", color: "text-emerald-400", Icon: CheckCircle },
  partial:   { label: "Partial",   color: "text-yellow-400",  Icon: AlertCircle },
  aborted:   { label: "Aborted",   color: "text-gray-400",    Icon: XCircle },
  failed:    { label: "Failed",    color: "text-red-400",     Icon: XCircle },
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
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-3">
      <div className="flex items-center gap-2">
        <Icon className={cn("h-4 w-4", cfg.color)} />
        <span className={cn("text-sm font-semibold", cfg.color)}>{cfg.label}</span>
        {state.product && (
          <span className="ml-1 text-sm text-gray-400 truncate max-w-xs">— {state.product}</span>
        )}
      </div>
      <div className="flex items-center gap-4 text-sm">
        <span className="flex items-center gap-1 text-gray-400">
          <Clock className="h-3.5 w-3.5" />
          {elapsedLabel(state.startedAt, state.endedAt)}
        </span>
        <span className="font-semibold text-emerald-400">${state.spentUsd}</span>
      </div>
    </div>
  );
}

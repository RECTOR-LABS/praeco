import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** A compact metric tile for a debrief / summary row. */
export function StatTile({
  label,
  value,
  accent,
  icon,
}: {
  label: string;
  value: ReactNode;
  accent?: boolean;
  icon?: ReactNode;
}) {
  return (
    <div className="rounded-lg bg-card px-3 py-2.5 ring-1 ring-foreground/10">
      <div className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
        {icon}
        {label}
      </div>
      <div className={cn("mt-1 truncate font-mono text-lg tabular-nums", accent ? "text-live" : "text-ink")}>
        {value}
      </div>
    </div>
  );
}

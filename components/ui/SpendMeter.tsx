export function SpendMeter({
  spentUsd,
  budgetUsd,
  live,
}: {
  spentUsd: string;
  budgetUsd: string;
  live?: boolean;
}) {
  const pct = Math.max(0, Math.min(100, (Number(spentUsd) / Number(budgetUsd || "1")) * 100));
  return (
    <div className="flex items-center gap-3">
      <span className="font-mono text-[10px] uppercase tracking-wider text-muted">Spend</span>
      <div className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-white/10">
        <div className="h-full rounded-full bg-live shadow-glow-live" style={{ width: `${pct}%` }} />
        {live && (
          <div className="absolute inset-y-0 w-1/3 animate-meter-sweep bg-linear-to-r from-transparent via-live/40 to-transparent" />
        )}
      </div>
      <span className="font-mono text-xs tabular-nums text-ink">
        ${spentUsd} <span className="text-muted">/ ${budgetUsd}</span>
      </span>
    </div>
  );
}

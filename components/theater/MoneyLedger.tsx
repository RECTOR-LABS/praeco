import type { LedgerEntry } from "./reducer";
import { ConsolePanel } from "@/components/ui/ConsolePanel";
import { ReceiptChip } from "@/components/ui/ReceiptChip";

export function MoneyLedger({ entries }: { entries: LedgerEntry[] }) {
  if (entries.length === 0) return null;
  return (
    <ConsolePanel className="p-4">
      <h3 className="mb-3 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
        On-chain receipts
      </h3>
      <ul className="divide-y divide-line">
        {entries.map((entry) => (
          <li key={entry.basescanUrl} className="flex items-center justify-between gap-4 py-2 text-sm">
            <span className="font-medium text-ink">{entry.agentName}</span>
            <div className="flex items-center gap-3">
              <span className="font-mono font-semibold tabular-nums text-live">${entry.amountUsd}</span>
              <ReceiptChip href={entry.basescanUrl} label="Basescan" />
            </div>
          </li>
        ))}
      </ul>
    </ConsolePanel>
  );
}

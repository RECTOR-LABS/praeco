import type { LedgerEntry } from "./reducer";
import { BasescanLink } from "./BasescanLink";

export function MoneyLedger({ entries }: { entries: LedgerEntry[] }) {
  if (entries.length === 0) return null;
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-4">
      <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-500">
        On-chain receipts
      </h3>
      <ul className="divide-y divide-white/5">
        {entries.map((entry) => (
          <li key={entry.basescanUrl} className="flex items-center justify-between gap-4 py-2 text-sm">
            <span className="font-medium text-gray-200">{entry.agentName}</span>
            <div className="flex items-center gap-3">
              <span className="font-semibold text-emerald-400">${entry.amountUsd}</span>
              <BasescanLink
                href={entry.basescanUrl}
                label="Basescan"
                className="border-0 bg-transparent px-0 py-0 text-blue-400 hover:bg-transparent hover:text-blue-300"
              />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

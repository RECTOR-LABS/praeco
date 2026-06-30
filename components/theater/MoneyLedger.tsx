import type { LedgerEntry } from "./reducer";
import { ExternalLink, Receipt } from "lucide-react";

export function MoneyLedger({ entries }: { entries: LedgerEntry[] }) {
  if (entries.length === 0) return null;
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-4">
      <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-500">
        On-chain receipts
      </h3>
      <ul className="divide-y divide-white/5">
        {entries.map((entry, i) => (
          <li key={i} className="flex items-center justify-between gap-4 py-2 text-sm">
            <span className="font-medium text-gray-200">{entry.agentName}</span>
            <div className="flex items-center gap-3">
              <span className="font-semibold text-emerald-400">${entry.amountUsd}</span>
              <a
                href={entry.basescanUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs text-blue-400 transition-colors hover:text-blue-300"
              >
                <Receipt className="h-3 w-3" />
                Basescan ✓
                <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

import Link from "next/link";
import { listRecords } from "@/server/persistence";
import { baseUnitsToUsd } from "@/src/constants";

export const dynamic = "force-dynamic";

export default async function Landing() {
  const records = await listRecords();
  const flagship = records[0];
  const watchHref = flagship ? `/replay/${flagship.runId}` : `/intake?mode=sandbox`;

  return (
    <main className="min-h-screen bg-gray-950 text-white">
      <section className="mx-auto max-w-4xl px-6 py-24 text-center space-y-8">
        <h1 className="text-5xl font-bold tracking-tight">Praeco</h1>
        <p className="text-xl text-gray-400 max-w-2xl mx-auto">
          The general contractor for product launches — autonomous, on-chain, accountable.
        </p>
        <div className="flex flex-wrap justify-center gap-4">
          <Link
            href={watchHref}
            className="inline-flex items-center gap-2 rounded-lg bg-white/10 px-5 py-2.5 text-sm font-medium text-white hover:bg-white/20 transition-colors"
          >
            ▶ Watch a run
          </Link>
          <Link
            href="/intake?mode=sandbox"
            className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-emerald-500 transition-colors"
          >
            Try it free
          </Link>
          <Link
            href="/intake?mode=live"
            className="inline-flex items-center gap-2 rounded-lg border border-white/20 px-5 py-2.5 text-sm font-medium text-white hover:bg-white/5 transition-colors"
          >
            Run live ⚿
          </Link>
        </div>
      </section>

      {records.length > 0 && (
        <section className="mx-auto max-w-4xl px-6 pb-24 space-y-4">
          <h2 className="text-lg font-semibold text-gray-300">Recent runs</h2>
          <ul className="space-y-2">
            {records.map((rec) => (
              <li key={rec.runId}>
                <Link
                  href={`/replay/${rec.runId}`}
                  className="flex items-center justify-between rounded-lg border border-white/10 bg-white/5 px-4 py-3 hover:bg-white/10 transition-colors"
                >
                  <span className="font-mono text-sm text-gray-300 truncate max-w-xs">
                    {rec.runId}
                  </span>
                  <div className="flex items-center gap-4 text-sm shrink-0">
                    <span className="text-gray-500">{rec.status}</span>
                    <span className="text-emerald-400">
                      ${baseUnitsToUsd(BigInt(rec.spentBaseUnits))}
                    </span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}

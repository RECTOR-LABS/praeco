import Link from "next/link";
import { Play, ExternalLink, ArrowRight, Lock } from "lucide-react";
import { listRecords } from "@/server/persistence";
import { baseUnitsToUsd } from "@/src/constants";
import { Button } from "@/components/ui/button";
import { GridBackdrop } from "@/components/ui/GridBackdrop";
import { LiveDot } from "@/components/ui/LiveDot";
import { StatusPill } from "@/components/ui/StatusPill";
import { HeroPreview } from "@/components/marketing/HeroPreview";
import { LandingSections } from "@/components/marketing/LandingSections";

export const dynamic = "force-dynamic";

export default async function Landing() {
  const records = await listRecords();
  const flagship = records[0];
  const watchHref = flagship ? `/replay/${flagship.runId}` : `/intake?mode=sandbox`;

  return (
    <main className="relative isolate min-h-screen bg-ground text-ink">
      <GridBackdrop />

      {/* Nav */}
      <nav className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <span className="font-mono text-sm font-semibold tracking-tight text-ink">Praeco</span>
        <div className="flex items-center gap-2">
          <Button asChild variant="ghost" size="sm">
            <a href="https://github.com/RECTOR-LABS/praeco" target="_blank" rel="noopener noreferrer">
              <ExternalLink className="h-4 w-4" /> GitHub
            </a>
          </Button>
          <Button asChild size="sm">
            <Link href="/intake?mode=sandbox">Try free</Link>
          </Button>
        </div>
      </nav>

      {/* Hero */}
      <section className="mx-auto grid max-w-6xl items-center gap-12 px-6 pb-20 pt-10 lg:grid-cols-2 lg:pt-16">
        <div className="space-y-6">
          <span className="inline-flex items-center gap-2 rounded-full bg-live/10 px-3 py-1 font-mono text-[11px] uppercase tracking-wider text-live ring-1 ring-live/20">
            <LiveDot /> Autonomous · on-chain
          </span>
          <h1 className="text-balance text-4xl font-bold tracking-tight sm:text-5xl">
            Ship your launch.
            <br />
            <span className="text-live">Autonomously.</span>
          </h1>
          <p className="max-w-md text-pretty text-base leading-relaxed text-muted-foreground">
            One brief in — a paid-for, QA&apos;d launch kit out. Praeco hires real specialist agents on the CROO marketplace, pays them in USDC on Base, and hands you the kit with on-chain receipts.
          </p>
          <div className="flex flex-wrap gap-3">
            <Button asChild size="lg">
              <Link href={watchHref}>
                <Play className="h-4 w-4" /> Watch a run
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href="/intake?mode=sandbox">
                Try it free <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="ghost">
              <Link href="/intake?mode=live">
                <Lock className="h-4 w-4" /> Run live
              </Link>
            </Button>
          </div>
        </div>
        <div className="lg:pl-4">
          <HeroPreview />
        </div>
      </section>

      {/* Progressive-disclosure story */}
      <LandingSections />

      {/* Recent runs */}
      {records.length > 0 && (
        <section className="mx-auto max-w-5xl px-6 pb-24">
          <div className="mb-4 flex items-center gap-2">
            <h2 className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground">Recent runs</h2>
            <StatusPill tone="muted">{records.length}</StatusPill>
          </div>
          <ul className="space-y-2">
            {records.map((rec) => (
              <li key={rec.runId}>
                <Link
                  href={`/replay/${rec.runId}`}
                  className="flex items-center justify-between rounded-lg bg-card px-4 py-3 ring-1 ring-foreground/10 transition-colors hover:bg-panel-2"
                >
                  <span className="truncate font-mono text-sm text-muted-foreground">{rec.runId}</span>
                  <div className="flex shrink-0 items-center gap-4 text-sm">
                    <span className="font-mono text-xs uppercase tracking-wider text-muted-foreground">{rec.status}</span>
                    <span className="font-mono tabular-nums text-live">${baseUnitsToUsd(BigInt(rec.spentBaseUnits))}</span>
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

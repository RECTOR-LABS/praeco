import type { Metadata } from "next";
import { ExternalLink, Rocket, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { GridBackdrop } from "@/components/ui/GridBackdrop";
import { PITCH_VIDEO_URL, TAGLINE, BULLETS, PROOF, LINKS } from "./content";

export const metadata: Metadata = {
  title: "Praeco — Pitch",
  description: "Autonomous launch-kit composer on the CROO Agent Protocol. Watch the 5-minute demo.",
};

export default function Pitch() {
  return (
    <main className="relative isolate min-h-screen bg-ground text-ink">
      <GridBackdrop />

      <section className="mx-auto max-w-4xl px-6 pt-16 pb-10 text-center">
        <span className="font-mono text-sm font-semibold tracking-tight text-live">Praeco</span>
        <h1 className="mt-4 text-balance text-3xl font-semibold sm:text-4xl">
          {TAGLINE}
        </h1>
      </section>

      {/* Video */}
      <section className="mx-auto max-w-4xl px-6">
        <div
          data-testid="pitch-video"
          className="overflow-hidden rounded-xl border border-white/10 bg-panel shadow-2xl"
        >
          {PITCH_VIDEO_URL ? (
            <video
              controls
              preload="metadata"
              className="aspect-video w-full"
              src={PITCH_VIDEO_URL}
            />
          ) : (
            <div className="flex aspect-video w-full items-center justify-center text-sm text-ink/50">
              Demo video publishing shortly.
            </div>
          )}
        </div>
      </section>

      {/* Brief */}
      <section className="mx-auto max-w-3xl px-6 py-12">
        <h2 className="mb-4 text-lg font-semibold">What it is</h2>
        <ul className="space-y-3">
          {BULLETS.map((b, i) => (
            <li key={i} className="flex gap-3 text-sm leading-relaxed text-ink/80">
              <span className="mt-1 text-live">▹</span>
              <span>{b}</span>
            </li>
          ))}
        </ul>
      </section>

      {/* On-chain proof */}
      <section className="mx-auto max-w-3xl px-6 pb-12">
        <div className="rounded-xl border border-white/10 bg-panel p-6">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <ShieldCheck className="h-5 w-5 text-live" /> Real, on-chain
          </h2>
          <p className="mt-2 text-sm text-ink/70">
            The demo replay is a recorded run of the engine. This is the real Door B settlement —
            a seller order paid and delivered on Base mainnet, with a committed content hash.
          </p>
          <dl className="mt-4 space-y-1 font-mono text-xs text-ink/70">
            <div>CROO listing serviceId: {PROOF.serviceId}</div>
            <div className="break-all">deliver txHash: {PROOF.deliverTx}</div>
          </dl>
          <Button asChild variant="secondary" size="sm" className="mt-4">
            <a href={PROOF.basescan} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="h-4 w-4" /> Verify on Basescan
            </a>
          </Button>
        </div>
      </section>

      {/* CTAs */}
      <section className="mx-auto flex max-w-3xl flex-wrap justify-center gap-3 px-6 pb-24">
        <Button asChild>
          <a href={LINKS.app} target="_blank" rel="noopener noreferrer">
            <Rocket className="h-4 w-4" /> Live app
          </a>
        </Button>
        <Button asChild variant="secondary">
          <a href={LINKS.repo} target="_blank" rel="noopener noreferrer">
            <ExternalLink className="h-4 w-4" /> GitHub
          </a>
        </Button>
        <Button asChild variant="ghost">
          <a href={LINKS.dorahacks} target="_blank" rel="noopener noreferrer">
            <ExternalLink className="h-4 w-4" /> DoraHacks
          </a>
        </Button>
      </section>
    </main>
  );
}

"use client";

import type { LaunchKit, ProvenanceCard } from "@/src/types";
import { cn } from "@/lib/utils";
import { Copy, Download, ExternalLink, FileImage } from "lucide-react";

function SectionHeader({ label, onCopy }: { label: string; onCopy?: () => void }) {
  return (
    <div className="flex items-center justify-between">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500">{label}</h3>
      {onCopy && (
        <button
          type="button"
          onClick={onCopy}
          className="inline-flex items-center gap-1 text-xs text-gray-500 transition-colors hover:text-gray-300"
        >
          <Copy className="h-3 w-3" />
          Copy
        </button>
      )}
    </div>
  );
}

function ProvenanceCardItem({ card }: { card: ProvenanceCard }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/5 p-4 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-semibold text-white">{card.agentName}</span>
        <span className={cn(
          "rounded-full px-2 py-0.5 text-xs font-medium",
          "bg-white/10 text-gray-400",
        )}>
          {card.leg}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-xs text-gray-400">
        <span className="font-mono">{card.amountUsd} USDC</span>
        <span>·</span>
        <span className="font-mono truncate max-w-[200px]" title={card.contentHash}>
          {card.contentHash}
        </span>
      </div>
      <a
        href={card.basescanUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1 rounded-md border border-emerald-500/20 bg-emerald-500/10 px-2 py-1 text-xs text-emerald-400 transition-colors hover:bg-emerald-500/20"
      >
        <ExternalLink className="h-3 w-3" />
        Basescan receipt
      </a>
    </div>
  );
}

export function KitView({ kit }: { kit: LaunchKit }) {
  const isRealImage = /^https?:\/\//.test(kit.ogImageRef);

  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text).catch(() => {
      /* silently ignore — clipboard may be unavailable in non-secure contexts */
    });
  }

  function downloadJson() {
    const blob = new Blob([JSON.stringify(kit, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "launch-kit.json";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6 p-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-white">Launch Kit</h2>
        <button
          type="button"
          onClick={downloadJson}
          className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-gray-300 transition-colors hover:bg-white/10"
        >
          <Download className="h-3.5 w-3.5" />
          Download JSON
        </button>
      </div>

      {/* OG Image */}
      <section className="space-y-2">
        <SectionHeader label="OG Image" />
        {isRealImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={kit.ogImageRef}
            alt="OG image"
            className="rounded-lg border border-white/10 max-h-64 w-auto object-cover"
          />
        ) : (
          <div className="rounded-lg border border-amber-500/20 bg-amber-500/10 p-4 space-y-2">
            <div className="flex items-center gap-2">
              <FileImage className="h-4 w-4 text-amber-400" aria-hidden="true" />
              <span className="text-sm font-medium text-amber-300">
                OG image — asset reference
              </span>
            </div>
            <p className="font-mono text-xs text-gray-400 break-all">{kit.ogImageRef}</p>
          </div>
        )}
      </section>

      {/* Short Pitch */}
      <section className="space-y-2">
        <SectionHeader label="Short Pitch" onCopy={() => copyToClipboard(kit.shortPitch)} />
        <p className="rounded-lg border border-white/10 bg-white/5 p-4 text-sm text-gray-200 leading-relaxed">
          {kit.shortPitch}
        </p>
      </section>

      {/* Landing Copy */}
      <section className="space-y-2">
        <SectionHeader label="Landing Copy" onCopy={() => copyToClipboard(kit.landingCopy)} />
        <pre className="whitespace-pre-wrap rounded-lg border border-white/10 bg-white/5 p-4 text-sm text-gray-200 leading-relaxed font-sans">
          {kit.landingCopy}
        </pre>
      </section>

      {/* PH / HN Blurb */}
      <section className="space-y-2">
        <SectionHeader label="PH / HN Blurb" onCopy={() => copyToClipboard(kit.phHnBlurb)} />
        <p className="rounded-lg border border-white/10 bg-white/5 p-4 text-sm text-gray-200 leading-relaxed">
          {kit.phHnBlurb}
        </p>
      </section>

      {/* Tweet Thread */}
      <section className="space-y-2">
        <SectionHeader label="Tweet Thread" />
        <div className="space-y-2">
          {kit.tweetThread.map((tweet, i) => (
            <div key={i} className="flex items-start gap-3 rounded-lg border border-white/10 bg-white/5 p-4">
              <span className="mt-0.5 shrink-0 font-mono text-xs text-gray-500">{i + 1}</span>
              <p className="min-w-0 flex-1 text-sm leading-relaxed text-gray-200">{tweet}</p>
              <button
                type="button"
                aria-label={`Copy tweet ${i + 1}`}
                onClick={() => copyToClipboard(tweet)}
                className="shrink-0 text-gray-500 transition-colors hover:text-gray-300"
              >
                <Copy className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      </section>

      {/* README Polish */}
      <section className="space-y-2">
        <SectionHeader label="README Polish" onCopy={() => copyToClipboard(kit.readmePolish)} />
        <pre className="whitespace-pre-wrap rounded-lg border border-white/10 bg-white/5 p-4 text-sm text-gray-200 leading-relaxed font-sans">
          {kit.readmePolish}
        </pre>
      </section>

      {/* Provenance */}
      {kit.provenance.length > 0 && (
        <section className="space-y-2">
          <SectionHeader label="Provenance" />
          <div className="space-y-2">
            {kit.provenance.map((card, i) => (
              <ProvenanceCardItem key={i} card={card} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

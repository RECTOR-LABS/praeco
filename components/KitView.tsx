"use client";

import type { LaunchKit, ProvenanceCard, LegKind } from "@/src/types";
import { Copy, Download, FileImage } from "lucide-react";
import { ConsolePanel } from "@/components/ui/ConsolePanel";
import { StatusPill } from "@/components/ui/StatusPill";
import { ReceiptChip } from "@/components/ui/ReceiptChip";

function copyToClipboard(text: string) {
  navigator.clipboard
    .writeText(text)
    .catch((err) => console.warn("[kit] clipboard write failed", err));
}

function SectionHeader({ label, onCopy }: { label: string; onCopy?: () => void }) {
  return (
    <div className="flex items-center justify-between">
      <h3 className="font-mono text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</h3>
      {onCopy && (
        <button
          type="button"
          onClick={onCopy}
          className="inline-flex items-center gap-1 font-mono text-[11px] text-muted-foreground transition-colors hover:text-ink"
        >
          <Copy className="h-3 w-3" />
          Copy
        </button>
      )}
    </div>
  );
}

const LEG_TONE: Record<LegKind, "research" | "copy" | "image"> = {
  research: "research",
  landing_copy: "copy",
  og_image: "image",
};

function ProvenanceCardItem({ card }: { card: ProvenanceCard }) {
  return (
    <ConsolePanel tone="live" glow className="space-y-2 p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-semibold text-ink">{card.agentName}</span>
        <StatusPill tone={LEG_TONE[card.leg] ?? "muted"}>{card.leg}</StatusPill>
      </div>
      <div className="flex flex-wrap items-center gap-2 font-mono text-xs text-muted-foreground">
        <span className="tabular-nums text-live">{card.amountUsd} USDC</span>
        <span>·</span>
        <span className="max-w-[200px] truncate" title={card.contentHash}>
          {card.contentHash}
        </span>
      </div>
      <ReceiptChip href={card.basescanUrl} label="Basescan" />
    </ConsolePanel>
  );
}

export function KitView({ kit }: { kit: LaunchKit }) {
  const isRealImage = /^https?:\/\//.test(kit.ogImageRef);

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
    <div className="mx-auto max-w-5xl space-y-6 p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-ink">
          Launch Kit <span className="font-mono text-xs uppercase tracking-wider text-live">· mission complete</span>
        </h2>
        <button
          type="button"
          onClick={downloadJson}
          className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-panel px-3 py-1.5 font-mono text-[11px] text-muted-foreground transition-colors hover:bg-panel-2 hover:text-ink"
        >
          <Download className="h-3.5 w-3.5" />
          Download JSON
        </button>
      </div>

      <section className="space-y-2">
        <SectionHeader label="OG Image" />
        {isRealImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={kit.ogImageRef}
            alt="OG image"
            className="max-h-64 w-auto rounded-lg border border-line object-cover"
          />
        ) : (
          <ConsolePanel tone="copy" glow className="space-y-2 p-4">
            <div className="flex items-center gap-2">
              <FileImage className="h-4 w-4 text-lane-copy" aria-hidden="true" />
              <span className="text-sm font-medium text-lane-copy">OG image — asset reference</span>
            </div>
            <p className="break-all font-mono text-xs text-muted-foreground">{kit.ogImageRef}</p>
          </ConsolePanel>
        )}
      </section>

      <section className="space-y-2">
        <SectionHeader label="Short Pitch" onCopy={() => copyToClipboard(kit.shortPitch)} />
        <ConsolePanel className="p-4 text-sm leading-relaxed text-ink/90">{kit.shortPitch}</ConsolePanel>
      </section>

      <section className="space-y-2">
        <SectionHeader label="Landing Copy" onCopy={() => copyToClipboard(kit.landingCopy)} />
        <ConsolePanel className="p-4">
          <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-ink/90">{kit.landingCopy}</pre>
        </ConsolePanel>
      </section>

      <section className="space-y-2">
        <SectionHeader label="PH / HN Blurb" onCopy={() => copyToClipboard(kit.phHnBlurb)} />
        <ConsolePanel className="p-4 text-sm leading-relaxed text-ink/90">{kit.phHnBlurb}</ConsolePanel>
      </section>

      <section className="space-y-2">
        <SectionHeader label="Tweet Thread" />
        <div className="space-y-2">
          {kit.tweetThread.map((tweet, i) => (
            <ConsolePanel key={i} className="flex items-start gap-3 p-4">
              <span className="mt-0.5 shrink-0 font-mono text-xs text-muted-foreground">{i + 1}</span>
              <p className="min-w-0 flex-1 text-sm leading-relaxed text-ink/90">{tweet}</p>
              <button
                type="button"
                aria-label={`Copy tweet ${i + 1}`}
                onClick={() => copyToClipboard(tweet)}
                className="shrink-0 text-muted-foreground transition-colors hover:text-ink"
              >
                <Copy className="h-3.5 w-3.5" />
              </button>
            </ConsolePanel>
          ))}
        </div>
      </section>

      <section className="space-y-2">
        <SectionHeader label="README Polish" onCopy={() => copyToClipboard(kit.readmePolish)} />
        <ConsolePanel className="p-4">
          <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-ink/90">{kit.readmePolish}</pre>
        </ConsolePanel>
      </section>

      {kit.provenance.length > 0 && (
        <section className="space-y-2">
          <SectionHeader label="Provenance" />
          <div className="space-y-2">
            {kit.provenance.map((card) => (
              <ProvenanceCardItem key={card.payTxHash} card={card} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

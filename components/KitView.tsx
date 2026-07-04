"use client";

import type { LaunchKit, ProvenanceCard, LegKind } from "@/src/types";
import { Copy, Download, FileImage, FileText, Type, Image as ImageIcon, Megaphone, MessageSquare, BookOpen, Coins, Users, ReceiptText } from "lucide-react";
import { ConsolePanel } from "@/components/ui/ConsolePanel";
import { StatusPill } from "@/components/ui/StatusPill";
import { StatTile } from "@/components/ui/StatTile";
import { ReceiptChip } from "@/components/ui/ReceiptChip";
import { Markdown } from "@/components/ui/Markdown";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

function copyToClipboard(text: string) {
  navigator.clipboard.writeText(text).catch((err) => console.warn("[kit] clipboard write failed", err));
}

function SectionHeader({ icon, label, onCopy }: { icon: React.ReactNode; label: string; onCopy?: () => void }) {
  return (
    <div className="flex items-center justify-between">
      <h3 className="flex items-center gap-1.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {icon}
        {label}
      </h3>
      {onCopy && (
        <Button variant="ghost" size="xs" onClick={onCopy} className="font-mono text-[11px] text-muted-foreground">
          <Copy className="h-3 w-3" />
          Copy
        </Button>
      )}
    </div>
  );
}

/** One asset block: labelled console panel, entering with a small stagger. */
function AssetSection({ icon, label, onCopy, delay, children }: {
  icon: React.ReactNode; label: string; onCopy?: () => void; delay: number; children: React.ReactNode;
}) {
  return (
    <section
      className="space-y-2 animate-in fade-in slide-in-from-bottom-2 duration-500"
      style={{ animationDelay: `${delay}ms`, animationFillMode: "backwards" }}
    >
      <SectionHeader icon={icon} label={label} onCopy={onCopy} />
      {children}
    </section>
  );
}

const LEG_TONE: Record<LegKind, "research" | "copy" | "image"> = {
  research: "research",
  landing_copy: "copy",
  og_image: "image",
};

function ProvenanceCardItem({ card }: { card: ProvenanceCard }) {
  return (
    <ConsolePanel tone="live" glow className="space-y-2 p-3.5">
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-sm font-semibold text-ink">{card.agentName}</span>
        <StatusPill tone={LEG_TONE[card.leg] ?? "muted"}>{card.leg}</StatusPill>
      </div>
      <div className="flex flex-wrap items-center gap-2 font-mono text-xs text-muted-foreground">
        <span className="tabular-nums text-live">{card.amountUsd} USDC</span>
        <span aria-hidden>·</span>
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="max-w-[150px] cursor-default truncate">{card.contentHash}</span>
          </TooltipTrigger>
          <TooltipContent className="font-mono text-[11px]">{card.contentHash}</TooltipContent>
        </Tooltip>
      </div>
      <ReceiptChip href={card.basescanUrl} label="Basescan" />
    </ConsolePanel>
  );
}

export function KitView({ kit }: { kit: LaunchKit }) {
  const isRealImage = /^https?:\/\//.test(kit.ogImageRef);
  const spent = kit.provenance.reduce((s, c) => s + (Number(c.amountUsd) || 0), 0);
  const specialists = new Set(kit.provenance.map((c) => c.agentName)).size;

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
    <TooltipProvider>
    <div className="mx-auto max-w-6xl space-y-6 p-4 md:p-6">
      {/* Debrief header */}
      <div className="space-y-4">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="text-2xl font-bold tracking-tight text-ink">
            Launch Kit <span className="font-mono text-xs uppercase tracking-wider text-live">· mission complete</span>
          </h2>
          <Button variant="outline" size="sm" onClick={downloadJson} className="font-mono text-[11px]">
            <Download className="h-3.5 w-3.5" />
            Download JSON
          </Button>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <StatTile label="Spent" accent icon={<Coins className="h-3 w-3" />} value={`$${spent.toFixed(2)}`} />
          <StatTile label="Specialists" icon={<Users className="h-3 w-3" />} value={specialists} />
          <StatTile label="On-chain receipts" icon={<ReceiptText className="h-3 w-3" />} value={kit.provenance.length} />
        </div>
      </div>

      {/* Assets (left) + provenance (right, sticky) */}
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <AssetSection icon={<ImageIcon className="h-3 w-3" />} label="OG Image" delay={0}>
            {isRealImage ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={kit.ogImageRef} alt="OG image" className="max-h-72 w-auto rounded-xl ring-1 ring-foreground/10" />
            ) : (
              <ConsolePanel tone="copy" glow className="space-y-2 p-4">
                <div className="flex items-center gap-2">
                  <FileImage className="h-4 w-4 text-lane-copy" aria-hidden="true" />
                  <span className="text-sm font-medium text-lane-copy">OG image — asset reference</span>
                </div>
                <p className="break-all font-mono text-xs text-muted-foreground">{kit.ogImageRef}</p>
              </ConsolePanel>
            )}
          </AssetSection>

          <AssetSection icon={<FileText className="h-3 w-3" />} label="Short Pitch" onCopy={() => copyToClipboard(kit.shortPitch)} delay={70}>
            <ConsolePanel className="p-4 text-sm leading-relaxed text-ink/90">{kit.shortPitch}</ConsolePanel>
          </AssetSection>

          <AssetSection icon={<Type className="h-3 w-3" />} label="Landing Copy" onCopy={() => copyToClipboard(kit.landingCopy)} delay={140}>
            <ConsolePanel className="p-4">
              <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-ink/90">{kit.landingCopy}</pre>
            </ConsolePanel>
          </AssetSection>

          <AssetSection icon={<Megaphone className="h-3 w-3" />} label="PH / HN Blurb" onCopy={() => copyToClipboard(kit.phHnBlurb)} delay={210}>
            <ConsolePanel className="p-4 text-sm leading-relaxed text-ink/90">{kit.phHnBlurb}</ConsolePanel>
          </AssetSection>

          <AssetSection icon={<MessageSquare className="h-3 w-3" />} label="Tweet Thread" delay={280}>
            <div className="space-y-2">
              {kit.tweetThread.map((tweet, i) => (
                <ConsolePanel key={i} className="flex items-start gap-3 p-4">
                  <span className="mt-0.5 shrink-0 font-mono text-xs text-live">{i + 1}</span>
                  <p className="min-w-0 flex-1 text-sm leading-relaxed text-ink/90">{tweet}</p>
                  <Button variant="ghost" size="icon-xs" aria-label={`Copy tweet ${i + 1}`} onClick={() => copyToClipboard(tweet)} className="text-muted-foreground">
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                </ConsolePanel>
              ))}
            </div>
          </AssetSection>

          <AssetSection icon={<BookOpen className="h-3 w-3" />} label="README Polish" onCopy={() => copyToClipboard(kit.readmePolish)} delay={350}>
            <ConsolePanel className="p-4">
              <Markdown>{kit.readmePolish}</Markdown>
            </ConsolePanel>
          </AssetSection>
        </div>

        <aside className="space-y-2 lg:sticky lg:top-6 lg:self-start">
          <h3 className="flex items-center gap-1.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            <ReceiptText className="h-3 w-3" />
            Provenance
          </h3>
          {kit.provenance.length > 0 ? (
            kit.provenance.map((card) => <ProvenanceCardItem key={card.payTxHash} card={card} />)
          ) : (
            <ConsolePanel className="p-4 text-xs text-muted-foreground">No on-chain receipts for this run.</ConsolePanel>
          )}
        </aside>
      </div>
    </div>
    </TooltipProvider>
  );
}

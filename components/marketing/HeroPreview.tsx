"use client";
import { useEffect, useState } from "react";
import { ConsolePanel } from "@/components/ui/ConsolePanel";
import { StatusPill } from "@/components/ui/StatusPill";
import { PhaseRail } from "@/components/ui/PhaseRail";
import { SpendMeter } from "@/components/ui/SpendMeter";
import { LiveDot } from "@/components/ui/LiveDot";

// Decorative, CANNED ambient preview of the Theater — NO SSE, no engine, no spend.
// A tiny scripted loop that conveys the "watch it transact" feel on the landing.
const LANES = [
  { leg: "Research", tone: "research" as const, agent: "ZERU" },
  { leg: "Copy", tone: "copy" as const, agent: "Foundr" },
  { leg: "Image", tone: "image" as const, agent: "Pygm" },
];
const PHASES = ["…", "search", "hire", "paid", "QA", "done"];

export function HeroPreview() {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setTick(15);
      return;
    }
    const id = setInterval(() => setTick((t) => (t + 1) % 16), 650);
    return () => clearInterval(id);
  }, []);

  const laneStep = (i: number) => Math.max(0, Math.min(5, tick - i * 2));
  const spent = Math.min(0.7, LANES.reduce((s, _l, i) => s + (laneStep(i) >= 3 ? [0.05, 0.15, 0.5][i] : 0), 0));

  return (
    <ConsolePanel glow tone="live" className="w-full p-4">
      <div className="mb-3 flex items-center justify-between">
        <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Praeco · Mission Control</span>
        <span className="inline-flex items-center gap-1.5 font-mono text-[10px] text-live">
          <LiveDot /> LIVE
        </span>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {LANES.map((l, i) => {
          const step = laneStep(i);
          return (
            <div key={l.leg} className="rounded-lg bg-panel-2/60 p-2 ring-1 ring-foreground/10">
              <div className="mb-1.5 flex items-center justify-between gap-1">
                <span className="font-mono text-[10px] uppercase tracking-wider text-ink">{l.leg}</span>
                <StatusPill tone={l.tone}>{PHASES[step]}</StatusPill>
              </div>
              <PhaseRail segments={6} activeIndex={step} />
              <div className="mt-1.5 truncate font-mono text-[10px] text-muted-foreground">{l.agent}</div>
            </div>
          );
        })}
      </div>
      <div className="mt-3">
        <SpendMeter spentUsd={spent.toFixed(2)} budgetUsd="2.00" live />
      </div>
    </ConsolePanel>
  );
}

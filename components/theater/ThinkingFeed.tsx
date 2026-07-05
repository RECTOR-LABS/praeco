"use client";
import { useState } from "react";
import { Brain, ChevronDown, ChevronUp } from "lucide-react";
import { ConsolePanel } from "@/components/ui/ConsolePanel";
import { StatusPill } from "@/components/ui/StatusPill";

export function ThinkingFeed({ lines }: { lines: string[] }) {
  const [open, setOpen] = useState(false);
  if (lines.length === 0) return null;
  return (
    <ConsolePanel className="overflow-hidden">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between px-4 py-3 text-sm text-muted-foreground transition-colors hover:text-ink"
      >
        <span className="flex items-center gap-2">
          <Brain className="h-4 w-4" />
          <span className="font-mono text-xs uppercase tracking-wider">Thinking feed</span>
          <StatusPill tone="muted">{lines.length}</StatusPill>
        </span>
        {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
      </button>
      {open && (
        <ul className="max-h-48 divide-y divide-line overflow-y-auto border-t border-line">
          {lines.map((line, i) => (
            <li key={i} className="animate-log-in px-4 py-2 font-mono text-[11px] leading-relaxed text-muted-foreground">
              {line}
            </li>
          ))}
        </ul>
      )}
    </ConsolePanel>
  );
}

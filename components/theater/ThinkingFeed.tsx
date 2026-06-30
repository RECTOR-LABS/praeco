"use client";
import { useState } from "react";
import { Brain, ChevronDown, ChevronUp } from "lucide-react";

export function ThinkingFeed({ lines }: { lines: string[] }) {
  const [open, setOpen] = useState(false);
  if (lines.length === 0) return null;
  return (
    <div className="overflow-hidden rounded-xl border border-white/10 bg-white/5">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between px-4 py-3 text-sm text-gray-400 transition-colors hover:text-gray-300"
      >
        <span className="flex items-center gap-2">
          <Brain className="h-4 w-4" />
          Thinking feed
          <span className="rounded-full bg-white/10 px-1.5 py-0.5 text-xs font-medium">
            {lines.length}
          </span>
        </span>
        {open ? (
          <ChevronUp className="h-4 w-4" />
        ) : (
          <ChevronDown className="h-4 w-4" />
        )}
      </button>
      {open && (
        <ul className="divide-y divide-white/5 border-t border-white/10 max-h-48 overflow-y-auto">
          {lines.map((line, i) => (
            <li key={i} className="px-4 py-2 text-xs leading-relaxed text-gray-400">
              {line}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

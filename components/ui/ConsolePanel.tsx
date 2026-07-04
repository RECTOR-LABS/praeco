import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

const GLOW: Record<string, string> = {
  research: "border-lane-research/40 shadow-glow-research",
  copy: "border-lane-copy/40 shadow-glow-copy",
  image: "border-lane-image/40 shadow-glow-image",
  live: "border-live/40 shadow-glow-live",
  danger: "border-danger/40",
};

export function ConsolePanel({
  tone,
  glow,
  className,
  children,
}: {
  tone?: keyof typeof GLOW;
  glow?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border border-line bg-panel/80 backdrop-blur-xs transition-shadow",
        glow && tone ? GLOW[tone] : "",
        className,
      )}
    >
      {children}
    </div>
  );
}

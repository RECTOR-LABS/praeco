import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

const GLOW: Record<string, string> = {
  research: "ring-lane-research/40 shadow-glow-research",
  copy: "ring-lane-copy/40 shadow-glow-copy",
  image: "ring-lane-image/40 shadow-glow-image",
  live: "ring-live/40 shadow-glow-live",
  danger: "ring-danger/40",
};

/** A framed console surface — the shadcn Card aesthetic (bg-card + hairline ring),
 *  with an optional per-tone neon glow. Kept as a light wrapper (not the rigid
 *  Card structure) so it composes into the varied Theater/kit layouts. */
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
        "rounded-xl bg-card ring-1 ring-foreground/10 backdrop-blur-xs transition-shadow",
        glow && tone ? GLOW[tone] : "",
        className,
      )}
    >
      {children}
    </div>
  );
}

import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export type PillTone = "live" | "research" | "copy" | "image" | "danger" | "muted";

const TONE: Record<PillTone, string> = {
  live: "bg-live/15 text-live",
  research: "bg-lane-research/15 text-lane-research",
  copy: "bg-lane-copy/15 text-lane-copy",
  image: "bg-lane-image/15 text-lane-image",
  danger: "bg-danger/15 text-danger",
  muted: "bg-white/10 text-muted-foreground",
};

/** A Mission-Control status chip built on the shadcn Badge (Radix Slot-capable). */
export function StatusPill({
  tone = "muted",
  className,
  children,
}: {
  tone?: PillTone;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Badge
      variant="secondary"
      className={cn(
        "border-transparent font-mono text-[10px] uppercase tracking-wider",
        TONE[tone],
        className,
      )}
    >
      {children}
    </Badge>
  );
}

import type { ReactNode } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const pill = cva(
  "inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider",
  {
    variants: {
      tone: {
        live: "bg-live/15 text-live",
        research: "bg-lane-research/15 text-lane-research",
        copy: "bg-lane-copy/15 text-lane-copy",
        image: "bg-lane-image/15 text-lane-image",
        danger: "bg-danger/15 text-danger",
        muted: "bg-white/10 text-muted",
      },
    },
    defaultVariants: { tone: "muted" },
  },
);

export function StatusPill({
  tone,
  className,
  children,
}: VariantProps<typeof pill> & { className?: string; children: ReactNode }) {
  return <span className={cn(pill({ tone }), className)}>{children}</span>;
}

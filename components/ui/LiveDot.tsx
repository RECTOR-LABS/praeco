import { cn } from "@/lib/utils";

export function LiveDot({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-block h-2 w-2 rounded-full bg-live shadow-glow-live animate-pulse-dot",
        className,
      )}
      aria-hidden
    />
  );
}

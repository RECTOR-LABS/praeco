import { cn } from "@/lib/utils";

export function PhaseRail({
  segments,
  activeIndex,
  blocked,
}: {
  segments: number;
  activeIndex: number;
  blocked?: boolean;
}) {
  return (
    <div className="flex gap-0.5">
      {Array.from({ length: segments }).map((_, i) => (
        <div
          key={i}
          data-rail-seg
          className={cn(
            "h-1 flex-1 rounded-full transition-colors",
            blocked ? "bg-danger/60" : i <= activeIndex ? "bg-live" : "bg-white/10",
          )}
        />
      ))}
    </div>
  );
}

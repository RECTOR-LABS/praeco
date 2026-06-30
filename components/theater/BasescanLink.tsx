import { CircleCheck, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";

export function BasescanLink({
  href,
  label = "Basescan",
  className,
}: {
  href: string;
  label?: string;
  className?: string;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        "inline-flex items-center gap-1 rounded-md border border-emerald-500/20 bg-emerald-500/10 px-2 py-1 text-xs text-emerald-400 transition-colors hover:bg-emerald-500/20",
        className,
      )}
    >
      <CircleCheck className="h-3 w-3" />
      {label}
      <ExternalLink className="h-3 w-3" />
    </a>
  );
}

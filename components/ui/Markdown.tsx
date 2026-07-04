import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";

// Renders a markdown string in the Mission-Control palette. Used for kit assets
// that are authored as markdown (e.g. README polish) so they read as formatted
// content, not raw source — while the Copy affordance still copies the raw text.
const components: Components = {
  h1: (p) => <h1 className="text-lg font-semibold text-ink" {...p} />,
  h2: (p) => <h2 className="mt-4 text-base font-semibold text-ink" {...p} />,
  h3: (p) => <h3 className="mt-3 text-sm font-semibold uppercase tracking-wide text-ink" {...p} />,
  p: (p) => <p className="text-muted-foreground" {...p} />,
  ul: (p) => <ul className="list-disc space-y-1 pl-5 text-muted-foreground marker:text-live" {...p} />,
  ol: (p) => <ol className="list-decimal space-y-1 pl-5 text-muted-foreground" {...p} />,
  strong: (p) => <strong className="font-semibold text-ink" {...p} />,
  em: (p) => <em className="italic" {...p} />,
  a: (p) => <a className="text-live underline underline-offset-2" target="_blank" rel="noopener noreferrer" {...p} />,
  hr: () => <hr className="border-line" />,
  blockquote: (p) => <blockquote className="border-l-2 border-line pl-3 text-muted-foreground" {...p} />,
  pre: (p) => <pre className="overflow-x-auto" {...p} />,
  code: ({ className, children, ...p }) => {
    const isBlock = /language-/.test(className ?? "") || String(children).includes("\n");
    return isBlock ? (
      <code className="block overflow-x-auto rounded-md bg-panel-2 p-3 font-mono text-xs text-ink ring-1 ring-foreground/10" {...p}>
        {children}
      </code>
    ) : (
      <code className="rounded bg-panel-2 px-1 py-0.5 font-mono text-[0.85em] text-live" {...p}>
        {children}
      </code>
    );
  },
};

export function Markdown({ children, className }: { children: string; className?: string }) {
  return (
    <div className={cn("space-y-3 text-sm leading-relaxed", className)}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {children}
      </ReactMarkdown>
    </div>
  );
}

"use client";
import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Terminal, ArrowRight } from "lucide-react";
import { ConsolePanel } from "@/components/ui/ConsolePanel";
import { StatusPill } from "@/components/ui/StatusPill";
import { GridBackdrop } from "@/components/ui/GridBackdrop";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function detect(value: string, mode: string): Record<string, string> {
  if (/^https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/?$/.test(value)) {
    return { mode, repoUrl: value };
  }
  return { mode, text: value };
}

function IntakeForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const mode = searchParams.get("mode") ?? "sandbox";
  const [value, setValue] = useState("");
  const [loading, setLoading] = useState(false);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!value.trim()) return;
    setLoading(true);
    // Navigate to the single-request live stream — the run executes inside the SSE
    // response on the run page. No POST, no server-side run registry to break.
    const params = new URLSearchParams(detect(value.trim(), mode));
    router.push(`/run/live?${params.toString()}`);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="flex items-center justify-between">
        <Label htmlFor="brief" className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
          Launch brief
        </Label>
        <StatusPill tone={mode === "live" ? "live" : "muted"}>{mode}</StatusPill>
      </div>
      <Input
        id="brief"
        type="text"
        placeholder="Paste a one-liner or GitHub URL"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="bg-panel-2 font-mono"
        autoFocus
      />
      <Button type="submit" disabled={loading || !value.trim()} className="w-full" size="lg">
        {loading ? "Running…" : "Try it free"}
        {!loading && <ArrowRight className="h-4 w-4" />}
      </Button>
      {mode === "live" && !loading && (
        <p className="text-center text-xs text-muted-foreground">
          Live mode requires a valid <code className="font-mono text-ink">LIVE_RUN_TOKEN</code> — contact RECTOR for access.
        </p>
      )}
    </form>
  );
}

export default function IntakePage() {
  return (
    <main className="relative isolate flex min-h-screen items-center justify-center bg-ground px-6 text-ink">
      <GridBackdrop />
      <ConsolePanel glow tone="live" className="w-full max-w-lg space-y-6 p-6">
        <div className="space-y-1.5">
          <h1 className="flex items-center gap-2 text-xl font-bold text-ink">
            <Terminal className="h-5 w-5 text-live" aria-hidden />
            Mission briefing
          </h1>
          <p className="text-sm text-muted-foreground">
            Describe your product or paste a GitHub repo — Praeco assembles the launch kit.
          </p>
        </div>
        <Suspense fallback={<div className="h-40 animate-pulse rounded-lg bg-panel-2" />}>
          <IntakeForm />
        </Suspense>
      </ConsolePanel>
    </main>
  );
}

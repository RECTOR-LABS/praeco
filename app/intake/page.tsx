"use client";
import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

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
    const params = new URLSearchParams(detect(value, mode));
    router.push(`/run/live?${params.toString()}`);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <input
        type="text"
        placeholder="Paste a one-liner or GitHub URL"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="w-full rounded-lg border border-white/20 bg-white/5 px-4 py-3 text-white placeholder-gray-500 outline-hidden focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
        autoFocus
      />
      <button
        type="submit"
        disabled={loading || !value.trim()}
        className="w-full rounded-lg bg-emerald-600 px-4 py-3 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50 transition-colors"
      >
        {loading ? "Running…" : "Try it free"}
      </button>
      {mode === "live" && !loading && (
        <p className="text-center text-xs text-gray-500">
          Live mode requires a valid <code className="font-mono">LIVE_RUN_TOKEN</code> — contact
          RECTOR to request access.
        </p>
      )}
    </form>
  );
}

export default function IntakePage() {
  return (
    <main className="min-h-screen bg-gray-950 text-white flex items-center justify-center px-6">
      <div className="w-full max-w-lg space-y-6">
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-bold">Start a run</h1>
          <p className="text-gray-400">
            Describe your product or paste a GitHub repo URL.
          </p>
        </div>
        <Suspense
          fallback={
            <div className="h-32 animate-pulse rounded-lg bg-white/5" />
          }
        >
          <IntakeForm />
        </Suspense>
      </div>
    </main>
  );
}

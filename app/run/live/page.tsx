"use client";
import { Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useLiveRunStream } from "@/components/theater/useLiveRunStream";
import { Theater } from "@/components/theater/Theater";
import { GridBackdrop } from "@/components/ui/GridBackdrop";

function LiveRun() {
  const sp = useSearchParams();
  const state = useLiveRunStream(sp.toString());
  const done = state.status !== "running";

  return (
    <main className="relative isolate min-h-screen bg-ground text-ink">
      <GridBackdrop />
      <Theater state={state} />
      {done && (
        <div className="py-8 text-center">
          <Link
            href="/"
            className="inline-flex items-center gap-2 rounded-lg border border-line bg-panel px-5 py-2.5 font-mono text-xs text-ink transition-colors hover:bg-panel-2"
          >
            ← Back home
          </Link>
        </div>
      )}
    </main>
  );
}

export default function LiveRunPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-ground" />}>
      <LiveRun />
    </Suspense>
  );
}

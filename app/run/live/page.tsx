"use client";
import { Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useLiveRunStream } from "@/components/theater/useLiveRunStream";
import { Theater } from "@/components/theater/Theater";

function LiveRun() {
  const sp = useSearchParams();
  const state = useLiveRunStream(sp.toString());
  const done = state.status !== "running";

  return (
    <main className="min-h-screen bg-gray-950 text-white">
      <Theater state={state} />
      {done && (
        <div className="py-8 text-center">
          <Link
            href="/"
            className="inline-flex items-center gap-2 rounded-lg bg-white/10 px-5 py-2.5 text-sm font-medium text-white hover:bg-white/20 transition-colors"
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
    <Suspense fallback={<div className="min-h-screen bg-gray-950" />}>
      <LiveRun />
    </Suspense>
  );
}

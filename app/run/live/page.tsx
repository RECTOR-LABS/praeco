"use client";
import { Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useLiveRunStream } from "@/components/theater/useLiveRunStream";
import { Theater } from "@/components/theater/Theater";
import { GridBackdrop } from "@/components/ui/GridBackdrop";
import { Button } from "@/components/ui/button";

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
          <Button asChild variant="outline">
            <Link href="/">← Back home</Link>
          </Button>
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

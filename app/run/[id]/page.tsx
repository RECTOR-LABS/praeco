"use client";
import { use } from "react";
import Link from "next/link";
import { useRunStream } from "@/components/theater/useRunStream";
import { Theater } from "@/components/theater/Theater";
import { GridBackdrop } from "@/components/ui/GridBackdrop";

export default function TheaterPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const state = useRunStream(id);

  return (
    <main className="relative isolate min-h-screen bg-ground text-ink">
      <GridBackdrop />
      <Theater state={state} />
      {(state.status === "completed" || state.status === "partial") && (
        <div className="py-8 text-center">
          <Link
            href={`/kit/${id}`}
            className="inline-flex items-center gap-2 rounded-lg border border-live/30 bg-live/10 px-5 py-2.5 font-mono text-xs font-semibold text-live transition-colors hover:bg-live/20"
          >
            View kit →
          </Link>
        </div>
      )}
    </main>
  );
}

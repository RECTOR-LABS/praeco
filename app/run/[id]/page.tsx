"use client";
import { use } from "react";
import Link from "next/link";
import { useRunStream } from "@/components/theater/useRunStream";
import { Theater } from "@/components/theater/Theater";

export default function TheaterPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const state = useRunStream(id);

  return (
    <main className="min-h-screen bg-gray-950 text-white">
      <Theater state={state} />
      {(state.status === "completed" || state.status === "partial") && (
        <div className="py-8 text-center">
          <Link
            href={`/kit/${id}`}
            className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-500 transition-colors"
          >
            View kit →
          </Link>
        </div>
      )}
    </main>
  );
}

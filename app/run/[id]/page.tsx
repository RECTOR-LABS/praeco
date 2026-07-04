"use client";
import { use } from "react";
import Link from "next/link";
import { useRunStream } from "@/components/theater/useRunStream";
import { Theater } from "@/components/theater/Theater";
import { GridBackdrop } from "@/components/ui/GridBackdrop";
import { Button } from "@/components/ui/button";

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
          <Button asChild size="lg">
            <Link href={`/kit/${id}`}>View kit →</Link>
          </Button>
        </div>
      )}
    </main>
  );
}

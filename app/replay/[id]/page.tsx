import { notFound } from "next/navigation";
import { loadRecord } from "@/server/persistence";
import { baseUnitsToUsd } from "@/src/constants";
import { ReplayStage } from "@/components/ReplayStage";
import { KitView } from "@/components/KitView";
import { GridBackdrop } from "@/components/ui/GridBackdrop";

export default async function ReplayPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const rec = await loadRecord(id);
  if (!rec) notFound();

  return (
    <main className="relative isolate min-h-screen bg-ground text-ink">
      <GridBackdrop />
      <ReplayStage runId={id} />
      {rec.kit && <KitView kit={rec.kit} spentUsd={baseUnitsToUsd(BigInt(rec.spentBaseUnits))} />}
    </main>
  );
}

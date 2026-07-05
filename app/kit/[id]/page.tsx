import { notFound } from "next/navigation";
import { loadRecord } from "@/server/persistence";
import { baseUnitsToUsd } from "@/src/constants";
import { KitView } from "@/components/KitView";
import { GridBackdrop } from "@/components/ui/GridBackdrop";

export default async function KitPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const rec = await loadRecord(id);
  if (!rec?.kit) notFound();

  return (
    <main className="relative isolate min-h-screen bg-ground text-ink">
      <GridBackdrop />
      <KitView kit={rec.kit} spentUsd={baseUnitsToUsd(BigInt(rec.spentBaseUnits))} />
    </main>
  );
}

import { notFound } from "next/navigation";
import { loadRecord } from "@/server/persistence";
import { ReplayStage } from "@/components/ReplayStage";
import { KitView } from "@/components/KitView";

export default async function ReplayPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const rec = await loadRecord(id);
  if (!rec) notFound();

  return (
    <main className="min-h-screen bg-gray-950 text-white">
      <ReplayStage runId={id} />
      {rec.kit && <KitView kit={rec.kit} />}
    </main>
  );
}

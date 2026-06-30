import { notFound } from "next/navigation";
import { loadRecord } from "@/server/persistence";
import { KitView } from "@/components/KitView";

export default async function KitPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const rec = await loadRecord(id);
  if (!rec?.kit) notFound();

  return (
    <main className="min-h-screen bg-gray-950 text-white">
      <KitView kit={rec.kit} />
    </main>
  );
}

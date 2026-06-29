import type { WorklogEvent } from "@/src/types"; // proves engine import resolves
export default function Landing() {
  const sample: WorklogEvent["kind"] = "run_started";
  return <main className="p-10"><h1 className="text-2xl font-bold">Praeco</h1><p className="sr-only">{sample}</p></main>;
}

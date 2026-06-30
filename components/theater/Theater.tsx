import type { TheaterState } from "./reducer";
import { REQUIRED_LEGS } from "@/src/constants";
import { BrainBar } from "./BrainBar";
import { Lane } from "./Lane";
import { MoneyLedger } from "./MoneyLedger";
import { ThinkingFeed } from "./ThinkingFeed";

export function Theater({ state }: { state: TheaterState }) {
  return (
    <div className="mx-auto max-w-5xl space-y-3 p-4">
      <BrainBar state={state} />
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        {REQUIRED_LEGS.map((leg) => <Lane key={leg} lane={state.lanes[leg]} />)}
      </div>
      <MoneyLedger entries={state.ledger} />
      <ThinkingFeed lines={state.thinking} />
    </div>
  );
}

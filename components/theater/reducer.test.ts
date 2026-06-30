import { it, expect } from "vitest";
import type { RunRecord, WorklogEvent } from "@/src/types";
import fixture from "@/test/fixtures/run-completed.json";
import { initialTheaterState, theaterReducer } from "./reducer.js";

const rec = fixture as unknown as RunRecord;
function fold() { return rec.worklog.reduce(theaterReducer, initialTheaterState()); }

it("advances each lane to accepted and sums spend", () => {
  const s = fold();
  expect(s.lanes.research.phase).toBe("accepted");
  expect(s.lanes.og_image.phase).toBe("accepted");
  expect(s.lanes.landing_copy.phase).toBe("accepted");
  expect(s.status).toBe("completed");
  expect(s.spentUsd).toBe("0.70");
  expect(s.ledger).toHaveLength(3);
  expect(s.ledger[0].basescanUrl).toMatch(/basescan/i);
});
it("captures the product and thinking narration", () => {
  const s = fold();
  expect(s.product).toBeTruthy();
  expect(s.thinking.length).toBeGreaterThan(0);
});
it("hire_paid is idempotent — feeding the same event twice yields ledger.length === 1 and single spend", () => {
  const pay: WorklogEvent = { kind: "hire_paid", at: 3, leg: "landing_copy", message: "paid", data: { orderId: "o1", payTxHash: "0xdupe" } };
  const seq: WorklogEvent[] = [
    { kind: "hire_negotiating", at: 1, leg: "landing_copy", message: "negotiating DupeAgent (svc-1)", data: { negotiationId: "n1" } },
    { kind: "hire_order_created", at: 2, leg: "landing_copy", message: "order o1 created", data: { orderId: "o1", price: "100000" } },
    pay,
    pay, // duplicate — same payTxHash → must be deduped
  ];
  const s = seq.reduce(theaterReducer, initialTheaterState());
  expect(s.ledger).toHaveLength(1);
  expect(s.spentUsd).toBe("0.10"); // single amount, not doubled
});
it("run_aborted after a legless error preserves failed status", () => {
  const seq: WorklogEvent[] = [
    { kind: "run_started", at: 1, message: "started" },
    { kind: "error", at: 2, message: "fatal: no legs available" },
    { kind: "run_aborted", at: 3, message: "aborted" },
  ];
  const s = seq.reduce(theaterReducer, initialTheaterState());
  expect(s.status).toBe("failed");
});
it("marks a leg blocked on a QA swap/redo (verdict word lives in the message; paid leg still bills)", () => {
  const seq: WorklogEvent[] = [
    { kind: "hire_negotiating", at: 1, leg: "landing_copy", message: "negotiating Pygm Studio (mock-copy)", data: { negotiationId: "n1" } },
    { kind: "hire_order_created", at: 2, leg: "landing_copy", message: "order o1 created", data: { orderId: "o1", price: "100000" } },
    { kind: "hire_paid", at: 3, leg: "landing_copy", message: "paid Pygm Studio — https://basescan.org/tx/0xabc", data: { orderId: "o1", payTxHash: "0xabc" } },
    { kind: "qa_verdict", at: 4, leg: "landing_copy", message: "QA swap: wrong deliverable format", data: { score: 30 } },
  ];
  const s = seq.reduce(theaterReducer, initialTheaterState());
  expect(s.lanes.landing_copy.phase).toBe("blocked");
  expect(s.lanes.landing_copy.note).toMatch(/swap/);
  expect(s.ledger).toHaveLength(1);       // the swapped-away provider was still paid
  expect(s.spentUsd).toBe("0.10");
});

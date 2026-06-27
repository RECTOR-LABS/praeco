import { describe, it, expect, vi } from "vitest";
import { Worklog, mapAgentEvent } from "./worklog.js";

describe("Worklog", () => {
  it("collects emitted events and notifies subscribers", () => {
    const wl = new Worklog();
    const seen: string[] = [];
    const unsub = wl.subscribe((e) => seen.push(e.kind));
    wl.emitKind("run_started", "go");
    wl.emit({ kind: "hire_paid", at: 1, message: "paid" });
    unsub();
    wl.emitKind("run_completed", "done");
    expect(wl.events.map((e) => e.kind)).toEqual(["run_started", "hire_paid", "run_completed"]);
    expect(seen).toEqual(["run_started", "hire_paid"]); // unsubscribed before the last
  });
});

describe("mapAgentEvent", () => {
  it("maps a tool call start to an agent_step", () => {
    const w = mapAgentEvent({ type: "tool_execution_start", toolCallId: "t", toolName: "hire_specialist", args: { leg: "research" } } as any);
    expect(w?.kind).toBe("agent_step");
    expect(w?.message).toContain("hire_specialist");
  });
  it("maps assistant turn text to an agent_step", () => {
    const w = mapAgentEvent({ type: "turn_end", message: { role: "assistant", content: [{ type: "text", text: "Hiring research first." }] }, toolResults: [] } as any);
    expect(w?.message).toBe("Hiring research first.");
  });
  it("ignores events with no narration value", () => {
    expect(mapAgentEvent({ type: "turn_start" } as any)).toBeNull();
    expect(mapAgentEvent({ type: "turn_end", message: { role: "assistant", content: [] }, toolResults: [] } as any)).toBeNull();
  });
});

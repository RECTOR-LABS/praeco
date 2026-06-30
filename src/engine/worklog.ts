/**
 * Worklog: the in-memory event stream that becomes the RunRecord and (Phase 2)
 * feeds the Agent-Economy Theater over SSE. Tools and run.ts emit rich domain
 * events; attachAgentWorklog adds the agent's own narration (tool-call intents
 * + assistant text) so the Theater can show Praeco "thinking".
 */
import type { Agent, AgentEvent } from "@earendil-works/pi-agent-core";
import type { WorklogEvent, WorklogEventKind, LegKind } from "../types.js";

export class Worklog {
  readonly events: WorklogEvent[] = [];
  private listeners = new Set<(e: WorklogEvent) => void>();

  emit(e: WorklogEvent): void {
    this.events.push(e);
    for (const l of this.listeners) l(e);
  }

  emitKind(kind: WorklogEventKind, message: string, extra?: { leg?: LegKind; data?: Record<string, unknown> }): void {
    this.emit({ kind, at: Date.now(), message, leg: extra?.leg, data: extra?.data });
  }

  subscribe(fn: (e: WorklogEvent) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
}

function assistantText(message: unknown): string {
  const m = message as { role?: string; content?: Array<{ type: string; text?: string }> };
  if (m?.role !== "assistant" || !Array.isArray(m.content)) return "";
  return m.content.filter((b) => b.type === "text").map((b) => b.text ?? "").join("").trim();
}

export function mapAgentEvent(ev: AgentEvent): WorklogEvent | null {
  if (ev.type === "tool_execution_start") {
    return { kind: "agent_step", at: Date.now(), message: `calling ${ev.toolName}`, data: { tool: ev.toolName, args: ev.args } };
  }
  if (ev.type === "turn_end") {
    const text = assistantText(ev.message);
    if (text) return { kind: "agent_step", at: Date.now(), message: text };
  }
  return null;
}

export function attachAgentWorklog(agent: Agent, worklog: Worklog): () => void {
  return agent.subscribe((ev) => {
    const w = mapAgentEvent(ev);
    if (w) worklog.emit(w);
  });
}

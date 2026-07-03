import type { CapProvider } from "@/src/cap/provider";
import type { RunRecord } from "@/src/types";
import type { IntakeInput } from "@/src/engine/intake";
import { kitToMarkdown, kitProvenanceJson } from "./kit-markdown.js";

export interface FulfillDeps {
  provider: CapProvider;
  runJob: (input: IntakeInput) => Promise<RunRecord>;
  assertFunded?: () => Promise<void>;
  poll?: { attempts: number; delayMs: number; sleep?: (ms: number) => Promise<void> };
  onLog?: (m: string) => void;
}
export interface FulfillResult { status: "delivered" | "rejected" | "skipped"; orderId?: string; contentHash?: string; reason?: string }

function parseBrief(requirements: string): IntakeInput | null {
  try {
    const r = JSON.parse(requirements) as { brief?: unknown };
    const brief = typeof r.brief === "string" ? r.brief.trim() : "";
    if (brief.length < 3) return null;
    return /^https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/?$/.test(brief) ? { repoUrl: brief } : { text: brief };
  } catch { return null; }
}

export async function fulfillOrder(deps: FulfillDeps): Promise<FulfillResult> {
  const log = deps.onLog ?? (() => {});
  const poll = deps.poll ?? { attempts: 40, delayMs: 3000 };
  const sleep = poll.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));

  const inbound = await deps.provider.listInboundNegotiations();
  if (inbound.length === 0) { log("no inbound negotiations"); return { status: "skipped", reason: "no inbound" }; }

  const n = inbound[0];
  const input = parseBrief(n.requirements);
  if (!input) {
    await deps.provider.rejectNegotiation(n.negotiationId, "requirements missing a valid 'brief'");
    log(`rejected ${n.negotiationId}: invalid brief`);
    return { status: "rejected", reason: "invalid brief" };
  }

  if (deps.assertFunded) await deps.assertFunded(); // accept costs provider gas
  const { orderId } = await deps.provider.acceptNegotiation(n.negotiationId);
  log(`accepted ${n.negotiationId} → order ${orderId}`);

  // Wait for the buyer to pay before spending a cent.
  let paid = false;
  for (let i = 0; i < poll.attempts; i++) {
    const o = await deps.provider.getOrder(orderId);
    if (o.status === "paid" || o.status === "delivering" || o.status === "completed") { paid = true; break; }
    if (["rejected", "cancelled", "canceled", "expired", "refunded", "failed"].includes(o.status)) {
      log(`order ${orderId} ended ${o.status} before payment`);
      return { status: "skipped", orderId, reason: `unpaid (${o.status})` };
    }
    await sleep(poll.delayMs);
  }
  if (!paid) { log(`order ${orderId} not paid within window`); return { status: "skipped", orderId, reason: "payment timeout" }; }

  let rec: RunRecord;
  try {
    rec = await deps.runJob(input); // spends ~$0.70 — only now, post-payment
  } catch (e) {
    const reason = `engine failed: ${(e as Error).message}`;
    log(`order ${orderId}: ${reason} — rejecting`);
    await deps.provider.rejectOrder(orderId, reason);
    return { status: "rejected", orderId, reason };
  }
  log(`run ${rec.runId} completed (${rec.status}, spent ${rec.spentBaseUnits} base units) — delivering order ${orderId}`);
  const requested = (input.text ?? input.repoUrl ?? "").slice(0, 300);
  const text = `${kitToMarkdown(rec)}\n\n---\n\n_Original request: ${requested}_\n`;
  const schema = kitProvenanceJson(rec);
  try {
    const { contentHash } = await deps.provider.deliverOrder(orderId, { deliverableType: "text", deliverableText: text, deliverableSchema: schema });
    log(`delivered order ${orderId} (${rec.status}) — contentHash ${contentHash}`);
    return { status: "delivered", orderId, contentHash };
  } catch (e) {
    log(`delivery FAILED for order ${orderId} — run ${rec.runId} already spent ${rec.spentBaseUnits}; needs re-delivery: ${(e as Error).message}`);
    throw e;
  }
}

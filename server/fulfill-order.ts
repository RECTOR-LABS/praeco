import type { CapProvider } from "@/src/cap/provider";
import type { RunRecord } from "@/src/types";
import type { IntakeInput } from "@/src/engine/intake";
import type { FulfillabilityAssessment } from "@/src/cap/fulfillability";
import { kitToMarkdown, kitProvenanceJson } from "./kit-markdown.js";

export interface FulfillDeps {
  provider: CapProvider;
  runJob: (input: IntakeInput) => Promise<RunRecord>;
  assertFunded?: () => Promise<void>;
  poll?: { attempts: number; delayMs: number; sleep?: (ms: number) => Promise<void> };
  deliver?: { attempts: number; delayMs: number };
  checkFulfillable?: () => Promise<FulfillabilityAssessment>;
  onLog?: (m: string) => void;
}
export interface FulfillResult { status: "delivered" | "rejected" | "skipped"; orderId?: string; contentHash?: string; txHash?: string; reason?: string }

// Order lifecycle vocabulary — verified against @croo-network/sdk@0.2.1 `OrderStatus`.
// Kept as literals so this server module (and its tests) stay decoupled from the SDK
// runtime; the SDK's OrderStatus const is the source of truth if the vocabulary changes.
const PAID_STATUSES = new Set(["paid", "delivering", "completed"]); // buyer has paid → safe to spend
const ABORT_STATUSES = new Set(["rejected", "rejecting", "expired", "create_failed", "pay_failed"]); // terminal before payment → abort early

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

  // Fulfillability gate: never accept + charge for a kit we can't fully staff
  // and afford. Read-only REST, runs before accept → a rejection costs $0.
  if (deps.checkFulfillable) {
    let f: FulfillabilityAssessment;
    try {
      f = await deps.checkFulfillable();
    } catch (e) {
      // A transient catalog/network error must neither accept (we can't confirm
      // the job) nor crash a long-running --watch daemon — skip and retry next poll.
      const reason = `fulfillability check unavailable: ${(e as Error).message}`;
      log(`skipping ${n.negotiationId}: ${reason}`);
      return { status: "skipped", reason };
    }
    if (!f.ok) {
      const reason = `cannot fulfill: ${f.reason ?? "required legs unavailable"}`;
      await deps.provider.rejectNegotiation(n.negotiationId, reason);
      log(`rejected ${n.negotiationId}: ${reason}`);
      return { status: "rejected", reason };
    }
    log(`fulfillable: ${f.perLeg.map((l) => `${l.leg}=${l.affordable}`).join(" ")}`);
  }

  if (deps.assertFunded) await deps.assertFunded(); // accept costs provider gas
  const { orderId } = await deps.provider.acceptNegotiation(n.negotiationId);
  log(`accepted ${n.negotiationId} → order ${orderId}`);

  // Wait for the buyer to pay before spending a cent.
  let paid = false;
  for (let i = 0; i < poll.attempts; i++) {
    const o = await deps.provider.getOrder(orderId);
    if (PAID_STATUSES.has(o.status)) { paid = true; break; }
    if (ABORT_STATUSES.has(o.status)) {
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
  // The run's USDC is already spent, so retry a transient delivery failure before giving up.
  const deliver = deps.deliver ?? { attempts: 3, delayMs: 2000 };
  // Never skip delivery after the engine has spent: clamp to at least one attempt so a
  // caller passing attempts<=0 still delivers (and lastErr is always set on real failure).
  const attempts = Math.max(1, deliver.attempts);
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      const { contentHash, txHash } = await deps.provider.deliverOrder(orderId, { deliverableType: "text", deliverableText: text, deliverableSchema: schema });
      log(`delivered order ${orderId} (${rec.status}) — contentHash ${contentHash}${txHash ? ` txHash ${txHash}` : ""}`);
      return { status: "delivered", orderId, contentHash, txHash };
    } catch (e) {
      lastErr = e;
      log(`delivery attempt ${i + 1}/${attempts} FAILED for order ${orderId}: ${(e as Error).message}`);
      if (i < attempts - 1) await sleep(deliver.delayMs);
    }
  }
  log(`delivery FAILED for order ${orderId} after ${attempts} attempts — run ${rec.runId} already spent ${rec.spentBaseUnits}; needs re-delivery: ${(lastErr as Error).message}`);
  throw lastErr;
}

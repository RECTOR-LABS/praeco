/**
 * One guarded CAP hire: negotiate → poll for provider accept → (price-cap +
 * payability checks) → pay USDC → poll for delivery. Poll-based, never reacts
 * to raw WS events (they replay on connect). Pays at most once. The proven
 * Phase-0 flow (scripts/cap-hire.ts), generalized for the engine.
 */
import type { LegKind, HireResult, Deliverable, WorklogEvent } from "../types.js";

export interface CapBuyer {
  negotiateOrder(req: { serviceId: string; requirements?: string }): Promise<{ negotiationId: string }>;
  getNegotiation(id: string): Promise<{ status: string; rejectReason?: string }>;
  listOrders(opts: { role: string; page: number; pageSize: number }): Promise<Array<{ orderId: string; negotiationId: string; price: string; status: string }>>;
  getOrder(id: string): Promise<{ status: string; deliverTxHash?: string }>;
  payOrder(id: string): Promise<{ txHash: string }>;
  getDelivery(id: string): Promise<{ deliverableType: string; deliverableText?: string; deliverableSchema?: string; contentHash: string }>;
}

export interface HireParams {
  leg: LegKind;
  serviceId: string;
  agentId: string;
  agentName: string;
  requirements: Record<string, unknown>;
  priceCapBaseUnits: bigint;
  assertPayable?: (priceBaseUnits: bigint) => Promise<void>;
  /** Called immediately after payOrder settles, before the delivery poll.
   *  Fires even if delivery subsequently times out, so spend is always recorded. */
  onPaid?: (priceBaseUnits: bigint, orderId: string) => void;
}

export interface HirePollOpts {
  negotiationPolls?: number;
  negotiationDelayMs?: number;
  deliveryPolls?: number;
  deliveryDelayMs?: number;
  sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const basescan = (tx: string) => `https://basescan.org/tx/${tx}`;

function parseSchema(raw?: string): unknown {
  if (!raw) return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

/**
 * One guarded CAP hire: negotiate → poll for provider accept → (price-cap +
 * payability checks) → pay USDC → poll for delivery. Poll-based, never reacts
 * to raw WS events (they replay on connect). Pays at most once. The proven
 * Phase-0 flow (scripts/cap-hire.ts), generalized for the engine.
 *
 * @requires The caller MUST hold an online authenticated WebSocket before
 * calling. An offline requester and an empty agent wallet both surface as the
 * same "no order created" timeout (Phase-0 finding #3).
 */
export async function hireSpecialist(
  client: CapBuyer,
  p: HireParams,
  onEvent: (e: WorklogEvent) => void,
  opts: HirePollOpts = {},
): Promise<HireResult> {
  const sleep = opts.sleep ?? defaultSleep;
  const negPolls = opts.negotiationPolls ?? 40;
  const negDelay = opts.negotiationDelayMs ?? 1500;
  const delPolls = opts.deliveryPolls ?? 60;
  const delDelay = opts.deliveryDelayMs ?? 3000;
  const emit = (kind: WorklogEvent["kind"], message: string, data?: Record<string, unknown>) =>
    onEvent({ kind, at: Date.now(), leg: p.leg, message, data });

  // 1. Negotiate.
  const neg = await client.negotiateOrder({ serviceId: p.serviceId, requirements: JSON.stringify(p.requirements) });
  emit("hire_negotiating", `negotiating ${p.agentName} (${p.serviceId})`, { negotiationId: neg.negotiationId });

  // 2. Poll until the provider accepts (order created) or rejects.
  let order: { orderId: string; negotiationId: string; price: string; status: string } | undefined;
  for (let i = 0; i < negPolls && !order; i++) {
    await sleep(negDelay);
    const n = await client.getNegotiation(neg.negotiationId);
    if (n.status === "rejected") throw new Error(`negotiation rejected by ${p.agentName}: ${n.rejectReason ?? "no reason"}`);
    if (n.status !== "pending" && n.status !== "accepted") {
      throw new Error(`negotiation ${neg.negotiationId} ended in unexpected status "${n.status}" from ${p.agentName}`);
    }
    const orders = await client.listOrders({ role: "buyer", page: 1, pageSize: 100 });
    const found = orders.find((o) => o.negotiationId === neg.negotiationId);
    // Pay only once the order has FINALIZED on-chain: it must have left the
    // transient "creating" status AND carry a price. Paying a still-"creating"
    // order reverts with a status error and burns paymaster gas — Phase-1 live
    // finding (2026-06-28): ZERU/Foundr orders surface in listOrders as
    // "creating" with an empty price for several seconds before becoming
    // payable; OpsPilot (Phase-0) just happened to finalize fast enough to hide
    // this race.
    if (found && found.status !== "creating" && found.price) order = found;
  }
  if (!order) throw new Error(`no payable order from ${p.agentName} within the poll window — order never left "creating" (or the agent wallet is unfunded, gate #1)`);

  let priceBaseUnits: bigint;
  try {
    priceBaseUnits = BigInt(order.price);
  } catch {
    throw new Error(`invalid price "${order.price}" for order ${order.orderId} from ${p.agentName} — expected integer base units`);
  }
  emit("hire_order_created", `order ${order.orderId} created at ${order.price} base units`, { orderId: order.orderId, price: order.price });

  // 3. Money guards — refuse to pay above the per-leg cap; honor caller payability gate.
  if (priceBaseUnits > p.priceCapBaseUnits) {
    throw new Error(`order price ${order.price} exceeds per-leg cap ${p.priceCapBaseUnits} — not paying`);
  }
  if (p.assertPayable) await p.assertPayable(priceBaseUnits);

  // 4. Pay (LIVE USDC settlement on Base) — exactly once.
  const pay = await client.payOrder(order.orderId);
  emit("hire_paid", `paid ${p.agentName} — ${basescan(pay.txHash)}`, { orderId: order.orderId, payTxHash: pay.txHash });
  // Record spend immediately after payment settles — before the delivery poll so a
  // delivery-timeout throw cannot escape the accounting.
  p.onPaid?.(priceBaseUnits, order.orderId);

  // 5. Poll for delivery.
  for (let i = 0; i < delPolls; i++) {
    await sleep(delDelay);
    const o = await client.getOrder(order.orderId);
    if (o.deliverTxHash || o.status === "completed") {
      const d = await client.getDelivery(order.orderId);
      const deliverable: Deliverable = {
        type: d.deliverableType,
        text: d.deliverableText || undefined,
        schema: parseSchema(d.deliverableSchema),
        contentHash: d.contentHash,
      };
      emit("hire_delivered", `delivered by ${p.agentName} (hash ${d.contentHash})`, { orderId: order.orderId, contentHash: d.contentHash });
      return {
        leg: p.leg,
        serviceId: p.serviceId,
        agentId: p.agentId,
        agentName: p.agentName,
        orderId: order.orderId,
        chainOrderId: order.orderId,
        priceBaseUnits: order.price,
        payTxHash: pay.txHash,
        deliverTxHash: o.deliverTxHash ?? "",
        deliverable,
        basescanPayUrl: basescan(pay.txHash),
        basescanDeliverUrl: o.deliverTxHash ? basescan(o.deliverTxHash) : "",
      };
    }
  }
  throw new Error(`${p.agentName} accepted + was paid (order ${order.orderId}) but did not deliver within the poll window`);
}

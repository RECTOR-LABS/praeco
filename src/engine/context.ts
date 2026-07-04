/**
 * Shared state for one run. The agent's tools and the money guard all read and
 * mutate this. Maps are the per-run ledgers (candidates discovered, hires paid,
 * QA verdicts, submitted assets) that make the guard's decisions and the final
 * RunRecord assembly possible.
 */
import type { Llm } from "../llm/llm.js";
import type { CapBuyer, HirePollOpts } from "../cap/hire.js";
import type { FetchFn } from "../cap/wallet.js";
import type { ServiceListing, AgentRecord } from "../cap/discovery.js";
import type { BudgetGuard } from "./budget.js";
import type { Worklog } from "./worklog.js";
import type { LaunchBrief, LegKind, LaunchAsset, ServiceCandidate, HireResult, QaVerdict } from "../types.js";

export interface RunConfig {
  apiUrl: string;
  rpcUrl: string;
  agentWallet: string;
  usdcTokenAddress: string;
  preferredServiceIds: Partial<Record<LegKind, string>>;
}

export interface RunContext {
  brief: LaunchBrief;
  llm: Llm;
  client: CapBuyer;
  budget: BudgetGuard;
  worklog: Worklog;
  config: RunConfig;
  fetchImpl: FetchFn;
  requiredLegs: LegKind[];
  hirePollOpts?: HirePollOpts;
  // marketplace catalog, fetched once per run and reused across legs/searches
  catalog?: ServiceListing[];
  agentsById?: Map<string, AgentRecord>;
  // per-run ledgers
  candidates: Map<string, ServiceCandidate>; // serviceId -> resolved candidate
  pendingHires: Map<string, HireResult>;      // orderId -> hire result awaiting QA/submit
  verdicts: Map<string, QaVerdict>;           // orderId -> QA verdict
  paidOrderIds: Set<string>;                  // idempotency ledger
  paidAttemptsByLeg: Map<LegKind, number>;    // paid hires per leg (money-loss bound, §7)
  assets: Map<LegKind, LaunchAsset>;          // submitted, QA-accepted, one per leg
}

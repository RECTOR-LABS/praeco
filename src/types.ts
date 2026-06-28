/** Praeco domain contract — shared types for the whole engine. */

export type LegKind = "research" | "landing_copy" | "og_image";

export interface LaunchBrief {
  product: string;       // what it is, one line
  audience: string;      // who it's for
  features: string[];    // key selling points
  tone: string;          // voice / positioning
  oneLiner: string;      // punchy one-sentence pitch
  sourceUrl?: string;    // repo URL when repo-native intake was used
}

export interface RequirementField {
  name: string;
  type: string;          // "string" | "boolean" | …
  required: boolean;
}

export interface ServiceCandidate {
  serviceId: string;
  agentId: string;
  agentName: string;
  title: string;                 // service title
  priceBaseUnits: string;        // USDC base units, decimal string
  requirementType: string;       // "schema" | "text"
  requirementSchema: RequirementField[];
  requirementText?: string;
  completedOrders: number;
  completionRate: number;        // 0..1
  avgDeliveryText?: string;
  onlineStatus?: string;
  orders7d?: number;
}

export interface Deliverable {
  type: string;          // "schema" | "text"
  text?: string;         // deliverableText, if any
  schema?: unknown;      // parsed deliverableSchema JSON, if any
  contentHash: string;
}

export interface HireResult {
  leg: LegKind;
  serviceId: string;
  agentId: string;
  agentName: string;
  orderId: string;
  chainOrderId: string;
  priceBaseUnits: string;
  payTxHash: string;
  deliverTxHash: string;
  deliverable: Deliverable;
  basescanPayUrl: string;
  basescanDeliverUrl: string;
}

export type QaAction = "accept" | "redo" | "swap";

export interface QaVerdict {
  action: QaAction;
  reason: string;
  score?: number;        // 0..100, optional
}

export interface ProvenanceCard {
  leg: LegKind;
  agentId: string;
  agentName: string;
  amountUsd: string;     // formatted, e.g. "0.10"
  contentHash: string;
  payTxHash: string;
  basescanUrl: string;
}

export interface LaunchAsset {
  leg: LegKind;
  hire: HireResult;
  verdict: QaVerdict;
  provenance: ProvenanceCard;
}

export interface LaunchKit {
  landingCopy: string;
  ogImageRef: string;    // URL or "hash:<contentHash>" reference
  tweetThread: string[];
  shortPitch: string;
  phHnBlurb: string;
  readmePolish: string;
  provenance: ProvenanceCard[];
}

export type WorklogEventKind =
  | "run_started" | "intake_done" | "leg_search" | "leg_candidate"
  | "hire_negotiating" | "hire_order_created" | "hire_paid" | "hire_delivered"
  | "qa_verdict" | "asset_submitted" | "hire_blocked" | "compose_started"
  | "run_completed" | "run_aborted" | "agent_step" | "error";

export interface WorklogEvent {
  kind: WorklogEventKind;
  at: number;            // epoch ms
  leg?: LegKind;
  message: string;
  data?: Record<string, unknown>;
}

export type RunStatus = "completed" | "partial" | "aborted" | "failed";

export interface RunRecord {
  runId: string;
  status: RunStatus;
  brief: LaunchBrief;
  assets: LaunchAsset[];
  kit?: LaunchKit;
  worklog: WorklogEvent[];
  spentBaseUnits: string;
  startedAt: number;
  endedAt: number;
}

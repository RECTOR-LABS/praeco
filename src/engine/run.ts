/**
 * Top-level engine entry point: intake -> build RunContext -> drive the agent
 * loop -> compose the kit -> assemble the RunRecord. The driver is injectable
 * so the full pipeline is testable with a scripted stand-in; the default driver
 * runs the real GLM-5.2 agent. Partial runs (some legs failed) still compose
 * whatever passed QA (graceful degradation, SPEC §10).
 */
import type { Model } from "@earendil-works/pi-ai";
import type { StreamFn } from "../llm/model.js";
import type { Config } from "../config.js";
import type { Llm } from "../llm/llm.js";
import type { CapBuyer, HirePollOpts } from "../cap/hire.js";
import type { FetchFn } from "../cap/wallet.js";
import type { RunContext } from "./context.js";
import type { RunRecord, RunStatus, LaunchAsset, LaunchKit, WorklogEvent } from "../types.js";
import { type IntakeInput, buildBrief } from "./intake.js";
import { BudgetGuard } from "./budget.js";
import { Worklog, attachAgentWorklog } from "./worklog.js";
import { createPraecoAgent } from "./agent.js";
import { composeKit } from "./compose.js";
import { REQUIRED_LEGS, usdToBaseUnits, baseUnitsToUsd } from "../constants.js";

export interface DriveResult {
  errorMessage?: string;
}

export type EngineDriver = (ctx: RunContext, deps: { model: Model<any>; streamFn: StreamFn }) => Promise<DriveResult>;

function kickoff(ctx: RunContext): string {
  return `Assemble the launch kit for "${ctx.brief.product}". Required legs: ${ctx.requiredLegs.join(", ")}. Begin with the first leg now.`;
}

const defaultDriver: EngineDriver = async (ctx, deps) => {
  const agent = createPraecoAgent(ctx, deps);
  attachAgentWorklog(agent, ctx.worklog);
  await agent.prompt(kickoff(ctx));
  return { errorMessage: agent.state.errorMessage };
};

export interface RunDeps {
  config: Config;
  llm: Llm;
  client: CapBuyer;
  model: Model<any>;
  streamFn: StreamFn;
  fetchImpl?: FetchFn;
  hirePollOpts?: HirePollOpts;
  now?: () => number;
  runId?: string;
  drive?: EngineDriver;
  onEvent?: (e: WorklogEvent) => void;
}

export async function runLaunchJob(input: IntakeInput, deps: RunDeps): Promise<RunRecord> {
  const now = deps.now ?? (() => Date.now());
  const startedAt = now();
  const runId = deps.runId ?? `run-${startedAt}`;
  const worklog = new Worklog();
  if (deps.onEvent) worklog.subscribe(deps.onEvent);
  worklog.emitKind("run_started", `run ${runId} started`);

  const brief = await buildBrief(deps.llm, input, deps.fetchImpl);
  worklog.emitKind("intake_done", `brief ready: ${brief.product}`, { data: { oneLiner: brief.oneLiner } });

  const budget = new BudgetGuard(usdToBaseUnits(deps.config.runBudgetUsdc), usdToBaseUnits(deps.config.legCapUsdc));
  const ctx: RunContext = {
    brief,
    llm: deps.llm,
    client: deps.client,
    budget,
    worklog,
    config: {
      apiUrl: deps.config.crooApiUrl,
      rpcUrl: deps.config.baseRpcUrl,
      agentWallet: deps.config.praecoAgentWallet,
      usdcTokenAddress: deps.config.usdcTokenAddress,
      preferredServiceIds: deps.config.preferredServiceIds,
    },
    fetchImpl: deps.fetchImpl ?? fetch,
    requiredLegs: REQUIRED_LEGS,
    hirePollOpts: deps.hirePollOpts,
    candidates: new Map(),
    pendingHires: new Map(),
    verdicts: new Map(),
    paidOrderIds: new Set(),
    paidAttemptsByLeg: new Map(),
    escapedPins: new Set(),
    assets: new Map(),
  };

  const drive = deps.drive ?? defaultDriver;
  let driveError: string | undefined;
  try {
    const res = await drive(ctx, { model: deps.model, streamFn: deps.streamFn });
    driveError = res.errorMessage;
    if (driveError) worklog.emitKind("error", `agent reported: ${driveError}`);
  } catch (e) {
    driveError = (e as Error).message;
    worklog.emitKind("error", `engine driver error: ${driveError}`);
  }

  const assets: LaunchAsset[] = ctx.requiredLegs
    .map((l) => ctx.assets.get(l))
    .filter((a): a is LaunchAsset => a !== undefined);

  let status: RunStatus;
  if (assets.length === ctx.requiredLegs.length) status = "completed";
  else if (assets.length > 0) status = "partial";
  else status = driveError ? "failed" : "aborted";

  let kit: LaunchKit | undefined;
  if (assets.length > 0) {
    worklog.emitKind("compose_started", "composing the launch kit");
    try {
      kit = await composeKit(deps.llm, brief, assets);
    } catch (e) {
      // composeKit can throw after legs were already paid (e.g. LLM schema failure).
      // Emit the error but let RunRecord assembly continue — status reflects the
      // asset count, not whether compose succeeded (graceful degradation, SPEC §10).
      worklog.emitKind("error", `compose failed: ${(e as Error).message}`);
    }
  }

  const endedAt = now();
  worklog.emitKind(status === "completed" ? "run_completed" : "run_aborted",
    `run ${runId}: ${status} — ${assets.length}/${ctx.requiredLegs.length} legs, spent $${baseUnitsToUsd(budget.spent)}`);

  return {
    runId,
    status,
    brief,
    assets,
    kit,
    worklog: worklog.events,
    spentBaseUnits: budget.spent.toString(),
    startedAt,
    endedAt,
  };
}

// Read-only ($0, no WS) marketplace fulfillability probe. Answers one question:
// "can the engine staff a CLEAN launch kit from the CURRENT live CROO
// marketplace, right now?"
//
// It mirrors the Door B pre-accept gate EXACTLY — same checkFulfillability, same
// findStalePins startup warning, same SEARCH_CANDIDATE_LIMIT / pins /
// self-exclusion the engine uses — so its verdict is what `door-b:fulfill` and
// `engine:run` would decide before spending a cent. Because a clean 3/3 depends
// on marketplace SUPPLY (each leg needs a live specialist that delivers usable
// inline content within the leg cap), it also surfaces per-leg alternatives and,
// with --deliverables, what each candidate actually DELIVERS.
//
// Use it to MONITOR supply: providers rotate online. When a real inline-image
// provider AND an in-budget copywriter appear, the verdict flips to STAFFABLE
// and a live clean run becomes worthwhile. Never spends; public REST only, so
// it is safe to run alongside a live watcher (no second WS on CROO_SDK_KEY).
//
//   pnpm marketplace:probe                 # supply + gate report
//   pnpm marketplace:probe --deliverables  # + $0 getAgent reads (deliverable format per leg)
//
// Exit code: 0 if the gate says a clean kit is staffable, 1 otherwise.
import "dotenv/config";
import { loadConfig } from "../src/config.js";
import { listServices, listAgents, discoverForLeg, getAgent } from "../src/cap/discovery.js";
import { checkFulfillability, findStalePins, parseBaseUnits, DEFAULT_LEG_QUERIES } from "../src/cap/fulfillability.js";
import { REQUIRED_LEGS, SEARCH_CANDIDATE_LIMIT, usdToBaseUnits, baseUnitsToUsd } from "../src/constants.js";

const deep = process.argv.includes("--deliverables");
const usd = (b: string | bigint) => `$${baseUnitsToUsd(typeof b === "bigint" ? b : BigInt(b))}`;
const withinCap = (price: string, cap: bigint) => {
  const b = parseBaseUnits(price);
  return b !== null && b > 0n && b <= cap;
};

async function main() {
  const cfg = loadConfig();
  const cap = usdToBaseUnits(cfg.legCapUsdc);

  console.log("=== MARKETPLACE FULFILLABILITY PROBE (read-only, $0) ===");
  console.log(`  api            : ${cfg.crooApiUrl}`);
  console.log(`  self (exclude) : ${cfg.praecoAgentId}`);
  console.log(`  leg cap        : ${cfg.legCapUsdc} USDC   run budget: ${cfg.runBudgetUsdc} USDC`);
  console.log(`  pins           : ${REQUIRED_LEGS.map((l) => `${l}=${cfg.preferredServiceIds[l] ?? "(unpinned)"}`).join("  ")}`);

  const [services, agents] = await Promise.all([
    listServices(cfg.crooApiUrl, fetch as never),
    listAgents(cfg.crooApiUrl, fetch as never),
  ]);
  const agentsById = new Map(agents.map((a) => [a.agentId, a]));
  console.log(`\n  live catalog   : ${services.length} services / ${agents.length} agents`);

  const stale = findStalePins(services, cfg.preferredServiceIds);
  if (stale.length) for (const { leg, serviceId } of stale) console.log(`  ⚠️  stale pin  : ${leg} → ${serviceId} is OFFLINE (absent from catalog)`);
  else console.log(`  stale pins     : none`);

  console.log(`\n=== PER-LEG (cap ${usd(cap)}) ===`);
  for (const leg of REQUIRED_LEGS) {
    const pin = cfg.preferredServiceIds[leg];
    console.log(`\n── ${leg} ──`);
    if (pin) {
      const live = services.find((s) => s.serviceId === pin);
      if (!live) console.log(`  pin ${pin}  ❌ offline (not in catalog)`);
      else {
        const a = agentsById.get(live.agentId);
        console.log(`  pin ${pin}  ${withinCap(live.priceBaseUnits, cap) ? "✅ within cap" : "❌ over cap / bad price"}`);
        console.log(`      "${live.name}" — ${a?.name ?? "?"}  ${usd(live.priceBaseUnits)}  online=${a?.onlineStatus ?? "?"}`);
      }
    }
    const alts = discoverForLeg(services, agentsById, leg, DEFAULT_LEG_QUERIES[leg], {
      excludeAgentId: cfg.praecoAgentId,
      limit: SEARCH_CANDIDATE_LIMIT,
    });
    console.log(`  top ${alts.length} unpinned candidate(s) [self-excluded, limit ${SEARCH_CANDIDATE_LIMIT}]:`);
    if (!alts.length) console.log(`      (none — no live specialist matches this leg)`);
    for (const c of alts) {
      console.log(`      ${withinCap(c.priceBaseUnits, cap) ? "✅" : "  "} ${usd(c.priceBaseUnits).padStart(7)}  rel=${c.relevance} deRank=${c.formatDeRank} online=${c.onlineStatus ?? "?"}  ${c.serviceId}  "${c.name}" — ${c.agentName}`);
      if (deep) {
        try {
          const ag = await getAgent(cfg.crooApiUrl, c.agentId, fetch as never);
          const svc = ag.services.find((s) => s.serviceId === c.serviceId);
          console.log(`             delivers: reqType=${svc?.requirementType ?? "?"} deliverableType=${svc?.deliverableType ?? "(unset)"}`);
        } catch (e) {
          console.log(`             delivers: getAgent failed — ${(e as Error).message}`);
        }
      }
    }
  }

  const verdict = await checkFulfillability(cfg, fetch as never);
  console.log(`\n=== GATE VERDICT (what fulfillOrder runs before accept) ===`);
  console.log(`  ok = ${verdict.ok}${verdict.reason ? `\n  reason: ${verdict.reason}` : ""}`);
  for (const l of verdict.perLeg) {
    console.log(`  ${l.leg.padEnd(13)} candidates=${l.candidates} affordable=${l.affordable}` +
      (l.cheapestBaseUnits ? ` cheapest=${usd(l.cheapestBaseUnits)}` : "") +
      (l.note ? `  ⚠️ ${l.note}` : ""));
  }
  console.log(`\n${verdict.ok
    ? "✅ STAFFABLE — every required leg has a live, in-budget specialist. A live clean run can proceed (still needs an explicit money-go)."
    : "❌ NOT STAFFABLE — a live clean run would fail-close at $0. Re-run when supply improves."}`);

  process.exit(verdict.ok ? 0 : 1);
}

main().catch((e) => { console.error("PROBE ERROR:", e); process.exit(2); });

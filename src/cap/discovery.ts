/**
 * CAP marketplace discovery against the public REST surface (no auth):
 *   {apiUrl}/backend/v1/public/{services | agents | agents/{id}}
 *
 * Discovery is CATALOG-driven, not keyword-search-driven. The live `/search?q=`
 * endpoint is brittle (single-keyword, returns `{agents:[…]}` of agents — not
 * services — and misses whole categories: `image`→0, `copy`→0). Instead we page
 * the full service catalog (`/services` → `{items:[…]}`) and the agent catalog
 * (`/agents` → `{agents:[…]}`, carrying reputation), then rank client-side by
 * leg-relevance × reputation × price. Per-service input schemas live on the
 * AGENT record (`/agents/{id}` → `{agent:{services:[…]}}`, Phase-0 finding #2),
 * where `requirementSchema` is a JSON-encoded STRING that must be parsed.
 *
 * Live-shape facts this module encodes (confirmed 2026-06-28):
 *   - search/agent payloads are object-wrapped (`{agents}`, `{items}`, `{agent}`)
 *   - `completionRate` is a percent (0–100), not a 0–1 fraction
 *   - service title field is `name` (not `title`); `price` is a base-unit string
 *   - `completedOrders` / `orders7d` / `total` are strings
 *   - `requirementSchema` / `deliverableSchema` are JSON-encoded strings
 */
import type { FetchFn } from "./wallet.js";
import type { ServiceCandidate, RequirementField, LegKind } from "../types.js";

/** One service from the `/services` catalog (no reputation, no schema). */
export interface ServiceListing {
  serviceId: string;
  agentId: string;
  name: string;            // service title (live field is `name`)
  description?: string;
  priceBaseUnits: string;  // USDC base units, decimal string
  orders7d?: number;
}

export interface AgentService {
  serviceId: string;
  title: string;
  price: string;
  requirementType: string;            // "schema" | "text"
  requirementSchema: RequirementField[];
  requirementText?: string;
  deliverableType?: string;           // "text" | "schema" — what the provider returns (was dropped pre-§7)
}

export interface AgentRecord {
  agentId: string;
  name: string;
  description?: string;
  completedOrders: number;
  completionRate: number;             // normalized to 0..1
  avgDeliveryText?: string;
  onlineStatus?: string;
  skillTagSlugs: string[];
  services: AgentService[];
}

/** A catalog listing fused with its agent's reputation + a leg-relevance score. */
export interface RankedListing extends ServiceListing {
  agentName: string;
  completedOrders: number;
  completionRate: number;
  onlineStatus?: string;
  skillTagSlugs: string[];
  relevance: number;
  repScore: number;
  formatDeRank: number;   // 0 = inline provider; 1 = code/redemption-titled (last resort for a leg)
}

const base = (apiUrl: string) => `${apiUrl.replace(/\/$/, "")}/backend/v1/public`;

async function getJson<T>(url: string, fetchImpl: FetchFn): Promise<T> {
  const res = await fetchImpl(url);
  if (!res.ok) throw new Error(`CAP public GET ${url} failed: ${res.status} ${res.statusText}`);
  return (await res.json()) as T;
}

/** Percent (0–100) → fraction (0–1). Already-fractional values pass through. */
export function normalizeRate(raw: unknown): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return n > 1 ? n / 100 : n;
}

const numOrUndef = (v: unknown): number | undefined => {
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
};

/** `requirementSchema` arrives as a JSON-encoded string (or array). Parse defensively. */
export function parseRequirementSchema(raw: unknown): RequirementField[] {
  let arr: unknown = raw;
  if (typeof raw === "string") {
    if (!raw.trim()) return [];
    try { arr = JSON.parse(raw); } catch { return []; }
  }
  if (!Array.isArray(arr)) return [];
  return arr
    .filter((f): f is Record<string, unknown> => !!f && typeof f === "object")
    // `required` may arrive as a bool or a stringified bool ("true"/"false");
    // Boolean("false") would be truthy, so compare explicitly.
    .map((f) => ({ name: String(f.name ?? ""), type: String(f.type ?? "string"), required: f.required === true || f.required === "true" }))
    .filter((f) => f.name);
}

function mapAgentService(s: Record<string, any>): AgentService {
  // Derive the type from the PARSED schema, not the raw field: a present-but-empty
  // schema string ("[]") is truthy and would mis-classify a free-text service as "schema".
  const requirementSchema = parseRequirementSchema(s.requirementSchema);
  return {
    serviceId: String(s.serviceId ?? s.id ?? ""),
    title: String(s.name ?? s.title ?? ""),
    price: String(s.price ?? s.priceBaseUnits ?? "0"),
    requirementType: String(s.requirementType ?? (requirementSchema.length ? "schema" : "text")),
    requirementSchema,
    requirementText: s.requirementText ? String(s.requirementText) : undefined,
    deliverableType: s.deliverableType ? String(s.deliverableType) : undefined,
  };
}

/** Page the public service catalog (`{items:[…], total}`); caps at pageSize=50 server-side. */
export async function listServices(
  apiUrl: string,
  fetchImpl: FetchFn = fetch,
  opts: { pageSize?: number; maxPages?: number } = {},
): Promise<ServiceListing[]> {
  const pageSize = opts.pageSize ?? 50;
  const maxPages = opts.maxPages ?? 10;
  const out: ServiceListing[] = [];
  const seen = new Set<string>();
  for (let page = 1; page <= maxPages; page++) {
    const d = await getJson<any>(`${base(apiUrl)}/services?page=${page}&pageSize=${pageSize}`, fetchImpl);
    const items: any[] = Array.isArray(d?.items) ? d.items : Array.isArray(d) ? d : [];
    if (items.length === 0) break;
    const before = out.length;
    for (const s of items) {
      const id = String(s.serviceId ?? s.id ?? "");
      if (!id || seen.has(id)) continue;
      seen.add(id);
      out.push({
        serviceId: id,
        agentId: String(s.agentId ?? ""),
        name: String(s.name ?? s.title ?? ""),
        description: s.description ? String(s.description) : undefined,
        priceBaseUnits: String(s.price ?? s.priceBaseUnits ?? "0"),
        orders7d: numOrUndef(s.orders7d),
      });
    }
    if (out.length === before) break; // page yielded only already-seen items — stop (e.g. API ignores `page`)
    const total = Number(d?.total ?? 0);
    if ((total && out.length >= total) || items.length < pageSize) break;
  }
  return out;
}

/** Page the public agent catalog (`{agents:[…], total}`) for reputation signal. */
export async function listAgents(
  apiUrl: string,
  fetchImpl: FetchFn = fetch,
  opts: { pageSize?: number; maxPages?: number } = {},
): Promise<AgentRecord[]> {
  const pageSize = opts.pageSize ?? 50;
  const maxPages = opts.maxPages ?? 10;
  const out: AgentRecord[] = [];
  const seen = new Set<string>();
  for (let page = 1; page <= maxPages; page++) {
    const d = await getJson<any>(`${base(apiUrl)}/agents?page=${page}&pageSize=${pageSize}`, fetchImpl);
    const items: any[] = Array.isArray(d?.agents) ? d.agents : Array.isArray(d) ? d : [];
    if (items.length === 0) break;
    const before = out.length;
    for (const a of items) {
      const id = String(a.agentId ?? "");
      if (!id || seen.has(id)) continue;
      seen.add(id);
      out.push({
        agentId: id,
        name: String(a.name ?? a.agentName ?? ""),
        description: a.description ? String(a.description) : undefined,
        completedOrders: Number(a.completedOrders ?? 0) || 0,
        completionRate: normalizeRate(a.completionRate),
        avgDeliveryText: a.avgDeliveryText ? String(a.avgDeliveryText) : undefined,
        onlineStatus: a.onlineStatus ? String(a.onlineStatus) : undefined,
        skillTagSlugs: Array.isArray(a.skillTagSlugs) ? a.skillTagSlugs.map(String) : [],
        services: Array.isArray(a.services) ? a.services.map(mapAgentService) : [],
      });
    }
    if (out.length === before) break; // page yielded only already-seen items — stop (e.g. API ignores `page`)
    const total = Number(d?.total ?? 0);
    if ((total && out.length >= total) || items.length < pageSize) break;
  }
  return out;
}

/** Fetch one agent record (`{agent:{…}}`), unwrapped + normalized, with parsed service schemas. */
export async function getAgent(apiUrl: string, agentId: string, fetchImpl: FetchFn = fetch): Promise<AgentRecord> {
  const raw = await getJson<any>(`${base(apiUrl)}/agents/${encodeURIComponent(agentId)}`, fetchImpl);
  const a = (raw && typeof raw === "object" && raw.agent) ? raw.agent : raw;
  return {
    agentId: String(a.agentId ?? agentId),
    name: String(a.name ?? a.agentName ?? ""),
    description: a.description ? String(a.description) : undefined,
    completedOrders: Number(a.completedOrders ?? 0) || 0,
    completionRate: normalizeRate(a.completionRate),
    avgDeliveryText: a.avgDeliveryText ? String(a.avgDeliveryText) : undefined,
    onlineStatus: a.onlineStatus ? String(a.onlineStatus) : undefined,
    skillTagSlugs: Array.isArray(a.skillTagSlugs) ? a.skillTagSlugs.map(String) : [],
    services: Array.isArray(a.services) ? a.services.map(mapAgentService) : [],
  };
}

/** Build a full candidate from an already-fetched agent record + a serviceId. */
export function candidateFromAgent(agent: AgentRecord, serviceId: string): ServiceCandidate {
  const svc = agent.services.find((s) => s.serviceId === serviceId);
  if (!svc) throw new Error(`service ${serviceId} not found on agent ${agent.agentId}`);
  return {
    serviceId,
    agentId: agent.agentId,
    agentName: agent.name,
    title: svc.title,
    priceBaseUnits: String(svc.price ?? "0"),
    requirementType: svc.requirementType,
    requirementSchema: svc.requirementSchema,
    requirementText: svc.requirementText,
    completedOrders: agent.completedOrders,
    completionRate: agent.completionRate,
    avgDeliveryText: agent.avgDeliveryText,
    onlineStatus: agent.onlineStatus,
    deliverableType: svc.deliverableType,
  };
}

/** Resolve a (serviceId, agentId) into a full candidate by reading the agent record. */
export async function resolveCandidate(
  apiUrl: string,
  serviceId: string,
  agentId: string,
  fetchImpl: FetchFn = fetch,
): Promise<ServiceCandidate> {
  return candidateFromAgent(await getAgent(apiUrl, agentId, fetchImpl), serviceId);
}

/** Keywords that mark a service as relevant to a launch-kit leg. */
const LEG_KEYWORDS: Record<LegKind, string[]> = {
  research: ["research", "intelligence", "analy", "audit", "insight", "report", "competit", "market", "data", "due dilig", "trend", "dossier", "diligence"],
  landing_copy: ["copy", "content", "writ", "landing", "blog", "article", "caption", "marketing", "seo", "narrative", "tweet", "post", "kol", "headline", "page", "text"],
  og_image: ["image", "logo", " art", "design", "graphic", "visual", "picture", "banner", "thumbnail", "photo", "meme", "avatar", "render", "illustrat", "icon", "poster", "img"],
};

/**
 * Field-weighted leg-relevance. A service's own NAME is the strongest identity
 * signal (×3); its description (×1) and the provider's coarse skill tags (×1)
 * are supporting signals only — otherwise an agent's tags bleed a service into
 * the wrong leg (e.g. a "Landing Page" service out-ranking the real image
 * provider for og_image). Distinctive query words add ×1.
 */
export function legRelevance(name: string, description: string, tags: string[], leg: LegKind, query: string): number {
  const kws = LEG_KEYWORDS[leg];
  if (!kws) return 0; // unknown leg (e.g. the LLM passed "image" instead of "og_image") — no crash
  const hits = (t: string) => { const h = ` ${t.toLowerCase()} `; return kws.filter((k) => h.includes(k)).length; };
  let score = 3 * hits(name) + hits(description) + hits(tags.join(" "));
  const own = ` ${(name + " " + description).toLowerCase()} `;
  for (const w of query.toLowerCase().split(/[^a-z0-9]+/)) if (w.length > 3 && own.includes(w)) score += 1;
  return score;
}

const priceOf = (p: string): number => {
  const n = Number(p);
  return p && Number.isFinite(n) ? n : Number.POSITIVE_INFINITY; // empty/unparseable prices rank last (Number("")===0 would otherwise sort cheapest)
};

/**
 * A service whose title/description signals a redemption-code delivery format
 * (e.g. Pygm "… Code" services) rather than inline content. These deliver a
 * code + platform link, not usable copy/image (§7), so they are de-ranked below
 * all inline providers for a leg — kept as last-resort candidates, not excluded.
 */
export function isCodeFormat(name: string, description: string): boolean {
  // Narrowed to a trailing "Code" in the NAME (the Pygm "… Text/Image Code" tell) or an
  // explicit redemption term — so "no-code", "source code", "promo code" etc. don't misfire.
  return /\bcode\s*$/i.test(name.trim()) || /\bredemption\b|\bredeem\b|\bvoucher\b/i.test(`${name} ${description}`);
}

/**
 * Rank catalog services for a leg: fuse each listing with its agent's reputation,
 * score leg-relevance, and order by relevance → reputation → price. Returns only
 * services that match the leg at all. A pinned `preferredServiceId` is an
 * authoritative operator override: if present in the catalog it is the SOLE
 * candidate returned (the agent hires exactly it — for controlled runs).
 */
export function discoverForLeg(
  services: ServiceListing[],
  agentsById: Map<string, AgentRecord>,
  leg: LegKind,
  query: string,
  opts: { preferredServiceId?: string; limit?: number } = {},
): RankedListing[] {
  const fuse = (s: ServiceListing, relevance: number): RankedListing => {
    const a = agentsById.get(s.agentId);
    const completionRate = a?.completionRate ?? 0;
    const completedOrders = a?.completedOrders ?? 0;
    return {
      ...s, agentName: a?.name ?? "", completedOrders, completionRate,
      onlineStatus: a?.onlineStatus, skillTagSlugs: a?.skillTagSlugs ?? [],
      relevance, repScore: completionRate * Math.log10(completedOrders + 1),
      formatDeRank: isCodeFormat(s.name, s.description ?? "") ? 1 : 0,
    };
  };
  // Operator override: a pinned serviceId is AUTHORITATIVE — it's the sole
  // candidate for the leg, so the agent hires exactly the vetted provider (no
  // reputation-based override). Used for controlled/golden-path runs.
  // Fail CLOSED: if the pinned id isn't in the catalog, return nothing rather
  // than silently ranking — paying a different, unvetted provider on a
  // controlled real-USDC run would defeat the whole point of pinning.
  if (opts.preferredServiceId) {
    const pinned = services.find((s) => s.serviceId === opts.preferredServiceId);
    return pinned ? [fuse(pinned, 999)] : [];
  }
  const ranked: RankedListing[] = services.map((s) =>
    fuse(s, legRelevance(s.name, s.description ?? "", agentsById.get(s.agentId)?.skillTagSlugs ?? [], leg, query)),
  );
  const matches = ranked.filter((r) => r.relevance > 0);
  matches.sort((a, b) => {
    if (a.formatDeRank !== b.formatDeRank) return a.formatDeRank - b.formatDeRank; // inline (0) before code (1)
    if (b.relevance !== a.relevance) return b.relevance - a.relevance;
    if (b.repScore !== a.repScore) return b.repScore - a.repScore;
    return priceOf(a.priceBaseUnits) - priceOf(b.priceBaseUnits);
  });
  return opts.limit ? matches.slice(0, opts.limit) : matches;
}

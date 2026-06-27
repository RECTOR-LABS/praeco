/**
 * CAP marketplace discovery against the public REST surface (no auth):
 *   {apiUrl}/backend/v1/public/{search?q= | agents/{id}}
 * The SDK has no marketplace search, so this is a thin fetch client. Input
 * schemas live on the AGENT record (findings #2), not on services, so a full
 * candidate is a service merged with its agent's reputation + requirementSchema.
 */
import type { FetchFn } from "./wallet.js";
import type { ServiceCandidate, RequirementField } from "../types.js";

export interface ServiceHit {
  serviceId: string;
  agentId: string;
  agentName: string;
  title: string;
  priceBaseUnits: string;
  orders7d?: number;
}

export interface AgentRecord {
  agentId: string;
  name: string;
  completedOrders: number;
  completionRate: number;
  avgDeliveryText?: string;
  onlineStatus?: string;
  services: Array<{
    serviceId: string;
    title: string;
    price: string;
    requirementType: string;
    requirementSchema?: RequirementField[];
    requirementText?: string;
  }>;
}

const base = (apiUrl: string) => `${apiUrl.replace(/\/$/, "")}/backend/v1/public`;

async function getJson<T>(url: string, fetchImpl: FetchFn): Promise<T> {
  const res = await fetchImpl(url);
  if (!res.ok) throw new Error(`CAP public GET ${url} failed: ${res.status} ${res.statusText}`);
  return (await res.json()) as T;
}

export async function searchServices(apiUrl: string, query: string, fetchImpl: FetchFn = fetch): Promise<ServiceHit[]> {
  const raw = await getJson<any[]>(`${base(apiUrl)}/search?q=${encodeURIComponent(query)}`, fetchImpl);
  return (Array.isArray(raw) ? raw : []).map((s) => ({
    serviceId: String(s.serviceId ?? s.id),
    agentId: String(s.agentId),
    agentName: String(s.agentName ?? s.name ?? ""),
    title: String(s.title ?? ""),
    priceBaseUnits: String(s.price ?? s.priceBaseUnits ?? "0"),
    orders7d: typeof s.orders7d === "number" ? s.orders7d : undefined,
  }));
}

export async function getAgent(apiUrl: string, agentId: string, fetchImpl: FetchFn = fetch): Promise<AgentRecord> {
  const a = await getJson<any>(`${base(apiUrl)}/agents/${encodeURIComponent(agentId)}`, fetchImpl);
  return {
    agentId: String(a.agentId ?? agentId),
    name: String(a.name ?? a.agentName ?? ""),
    completedOrders: Number(a.completedOrders ?? 0),
    completionRate: Number(a.completionRate ?? 0),
    avgDeliveryText: a.avgDeliveryText ? String(a.avgDeliveryText) : undefined,
    onlineStatus: a.onlineStatus ? String(a.onlineStatus) : undefined,
    services: Array.isArray(a.services) ? a.services : [],
  };
}

export async function resolveCandidate(
  apiUrl: string,
  serviceId: string,
  agentId: string,
  fetchImpl: FetchFn = fetch,
): Promise<ServiceCandidate> {
  const agent = await getAgent(apiUrl, agentId, fetchImpl);
  const svc = agent.services.find((s) => s.serviceId === serviceId);
  if (!svc) throw new Error(`service ${serviceId} not found on agent ${agentId}`);
  return {
    serviceId,
    agentId,
    agentName: agent.name,
    title: svc.title,
    priceBaseUnits: String(svc.price ?? "0"),
    requirementType: svc.requirementType,
    requirementSchema: Array.isArray(svc.requirementSchema) ? svc.requirementSchema : [],
    requirementText: svc.requirementText,
    completedOrders: agent.completedOrders,
    completionRate: agent.completionRate,
    avgDeliveryText: agent.avgDeliveryText,
    onlineStatus: agent.onlineStatus,
  };
}

/** Reputation-weighted ranking: pinned preferred first, then proven, then cheapest. */
export function rankCandidates(
  candidates: ServiceCandidate[],
  opts: { preferredServiceId?: string } = {},
): ServiceCandidate[] {
  const score = (c: ServiceCandidate) => c.completionRate * Math.log10(c.completedOrders + 1);
  const priceOf = (c: ServiceCandidate) => {
    const n = Number(c.priceBaseUnits);
    return Number.isFinite(n) ? n : Number.POSITIVE_INFINITY; // unparseable prices rank last
  };
  return [...candidates].sort((a, b) => {
    if (opts.preferredServiceId) {
      if (a.serviceId === opts.preferredServiceId) return -1;
      if (b.serviceId === opts.preferredServiceId) return 1;
    }
    const s = score(b) - score(a);
    if (s !== 0) return s;
    return priceOf(a) - priceOf(b);
  });
}

import { describe, it, expect, vi } from "vitest";
import { buildBrief, parseGithubRepo, OutOfScopeError } from "./intake.js";
import type { Llm } from "../llm/llm.js";

const brief = { product: "Streaky", audience: "indie devs", features: ["streaks", "reminders"], tone: "playful", oneLiner: "Track habits without the guilt.", inScope: true, scopeReason: "" };

function fakeLlm(): Llm {
  return {
    completeText: vi.fn(async () => ""),
    completeJson: vi.fn(async () => brief) as Llm["completeJson"],
  };
}

const readmeFetch = (body: string): typeof fetch =>
  (async (url: string) =>
    String(url).includes("README")
      ? new Response(body, { status: 200 })
      : new Response("not found", { status: 404 })) as unknown as typeof fetch;

describe("parseGithubRepo", () => {
  it("extracts owner/repo and strips .git", () => {
    expect(parseGithubRepo("https://github.com/RECTOR-LABS/praeco.git")).toEqual({ owner: "RECTOR-LABS", repo: "praeco" });
    expect(parseGithubRepo("not a url")).toBeNull();
  });
});

describe("buildBrief", () => {
  it("builds a brief from free text", async () => {
    const llm = fakeLlm();
    const out = await buildBrief(llm, { text: "A habit tracker named Streaky" });
    expect(out.product).toBe("Streaky");
    expect(out.sourceUrl).toBeUndefined();
  });

  it("reads the repo README into the prompt and tags sourceUrl", async () => {
    const llm = fakeLlm();
    const out = await buildBrief(llm, { repoUrl: "https://github.com/RECTOR-LABS/praeco" }, readmeFetch("# Streaky\nHabit tracking for builders."));
    const prompt = (llm.completeJson as any).mock.calls[0][0] as string;
    expect(prompt).toContain("Habit tracking for builders");
    expect(out.sourceUrl).toBe("https://github.com/RECTOR-LABS/praeco");
  });

  it("throws when neither text nor repoUrl is provided", async () => {
    await expect(buildBrief(fakeLlm(), {})).rejects.toThrow(/text or repoUrl/i);
  });

  it("throws when the repo yields no README or package.json and no text", async () => {
    const emptyFetch = (async () => new Response("not found", { status: 404 })) as unknown as typeof fetch;
    await expect(
      buildBrief(fakeLlm(), { repoUrl: "https://github.com/RECTOR-LABS/praeco" }, emptyFetch)
    ).rejects.toThrow(/could not read/i);
  });

  it("throws on a repoUrl that is not a GitHub repo", async () => {
    await expect(
      buildBrief(fakeLlm(), { repoUrl: "not a url" })
    ).rejects.toThrow(/not a recognizable github repo/i);
  });

  it("throws OutOfScopeError when the model flags the request out of scope", async () => {
    const llm = { completeText: async () => "", completeJson: (async () => ({
      product: "", audience: "", features: [], tone: "", oneLiner: "", inScope: false, scopeReason: "not a launchable product",
    })) as any } as any;
    await expect(buildBrief(llm, { text: "write me a smart contract" })).rejects.toBeInstanceOf(OutOfScopeError);
  });

  it("returns a clean LaunchBrief (no scope fields) when in scope", async () => {
    const llm = { completeText: async () => "", completeJson: (async () => ({
      product: "Streaky", audience: "devs", features: ["streaks"], tone: "playful", oneLiner: "Track habits.", inScope: true, scopeReason: "",
    })) as any } as any;
    const brief = await buildBrief(llm, { text: "a privacy-first habit tracker" });
    expect(brief.product).toBe("Streaky");
    expect((brief as any).inScope).toBeUndefined();
    expect((brief as any).scopeReason).toBeUndefined();
  });
});

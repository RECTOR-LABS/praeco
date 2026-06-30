/**
 * Intake: turn a one-liner or a GitHub repo into a structured LaunchBrief
 * (novelty #4, repo-native). For a repo we pull README + package.json from the
 * raw CDN (public, no auth) and let GLM-5.2's large context infer the product.
 */
import { z } from "zod";
import type { Llm } from "../llm/llm.js";
import type { LaunchBrief } from "../types.js";
import type { FetchFn } from "../cap/wallet.js";

export interface IntakeInput {
  text?: string;
  repoUrl?: string;
}

const briefSchema = z.object({
  product: z.string(),
  audience: z.string(),
  features: z.array(z.string()),
  tone: z.string(),
  oneLiner: z.string(),
});

export function parseGithubRepo(url: string): { owner: string; repo: string } | null {
  const m = url.match(/github\.com\/([^/\s]+)\/([^/\s]+)/i);
  if (!m) return null;
  return { owner: m[1], repo: m[2].replace(/\.git$/, "") };
}

async function fetchRaw(owner: string, repo: string, file: string, fetchImpl: FetchFn): Promise<string> {
  const url = `https://raw.githubusercontent.com/${owner}/${repo}/HEAD/${file}`;
  try {
    const res = await fetchImpl(url);
    if (!res.ok) return "";
    return (await res.text()).slice(0, 12000);
  } catch {
    return "";
  }
}

export async function buildBrief(llm: Llm, input: IntakeInput, fetchImpl: FetchFn = fetch): Promise<LaunchBrief> {
  let context = "";
  let sourceUrl: string | undefined;

  if (input.repoUrl) {
    const parsed = parseGithubRepo(input.repoUrl);
    if (!parsed) throw new Error(`not a recognizable GitHub repo URL: ${input.repoUrl}`);
    sourceUrl = input.repoUrl;
    const [readme, pkg] = await Promise.all([
      fetchRaw(parsed.owner, parsed.repo, "README.md", fetchImpl),
      fetchRaw(parsed.owner, parsed.repo, "package.json", fetchImpl),
    ]);
    context = `REPO: ${input.repoUrl}\n\nREADME.md:\n${readme || "(none)"}\n\npackage.json:\n${pkg || "(none)"}`;
    if (!readme && !pkg && !input.text) {
      throw new Error(`could not read README.md or package.json from ${input.repoUrl}`);
    }
  } else if (input.text) {
    context = `PRODUCT DESCRIPTION:\n${input.text}`;
  } else {
    throw new Error("intake requires either text or repoUrl");
  }

  if (input.text && input.repoUrl) context += `\n\nEXTRA NOTES:\n${input.text}`;

  const prompt =
    `You are Praeco's intake analyst. From the material below, infer a concise launch brief.\n\n` +
    `${context}\n\n` +
    `Respond with JSON: {"product":string,"audience":string,"features":string[],"tone":string,"oneLiner":string}.\n` +
    `product = what it is in a few words; audience = who it's for; features = 3-6 key selling points; ` +
    `tone = the voice for marketing copy; oneLiner = a punchy one-sentence pitch.`;

  const brief = await llm.completeJson(prompt, briefSchema);
  return sourceUrl ? { ...brief, sourceUrl } : brief;
}

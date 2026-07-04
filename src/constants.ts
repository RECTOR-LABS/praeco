import type { LegKind } from "./types.js";

/** Base mainnet USDC (6 decimals). The one allowed on-chain constant. */
export const BASE_USDC_ADDRESS = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
export const USDC_DECIMALS = 6;

export const DEFAULT_RUN_BUDGET_USDC = "2.00";
export const DEFAULT_LEG_CAP_USDC = "0.60"; // accommodates the $0.50 image leg + headroom
export const REQUIRED_LEGS: LegKind[] = ["research", "landing_copy", "og_image"];

/** Hard backstop against a runaway agent loop (turns = one LLM call + its tool batch). */
export const MAX_TURNS = 24;

/** Max PAID hires per leg before the guard stops spending on it (bounds loss on an unsatisfiable leg). */
export const MAX_PAID_ATTEMPTS_PER_LEG = 2;

const SCALE = 10n ** BigInt(USDC_DECIMALS);

/** Parse a decimal-dollar string to USDC base units. Rejects junk and >6dp precision. */
export function usdToBaseUnits(usd: string): bigint {
  if (!/^\d+(\.\d+)?$/.test(usd)) throw new Error(`Invalid USD amount: ${usd}`);
  const [whole, frac = ""] = usd.split(".");
  if (frac.length > USDC_DECIMALS) throw new Error(`USD amount exceeds ${USDC_DECIMALS}dp precision: ${usd}`);
  const fracPadded = frac.padEnd(USDC_DECIMALS, "0");
  return BigInt(whole) * SCALE + BigInt(fracPadded || "0");
}

/** Format USDC base units to a 2-dp dollar string for display. Rounds half-up. */
export function baseUnitsToUsd(b: bigint): string {
  const subunit = SCALE / 100n; // 10_000n — value of one cent in base units
  const cents = (b % SCALE + subunit / 2n) / subunit; // round half-up
  const whole = b / SCALE + cents / 100n; // carry if rounding pushed cents to 100
  const centsMod = cents % 100n;
  return `${whole}.${centsMod.toString().padStart(2, "0")}`;
}

import type { BeastSpecies } from "@provable-games/collectables";
import { collectablesClient } from "./collectablesClient";
import { MAX_BEASTS_PER_TYPE } from "./constants";
import { apiCache } from "../apiCache";

/**
 * Species catalog from the collectables API: the v3 registry (incl. species past
 * the original 75), or the 75 constants on a legacy deployment.
 */
export async function fetchBeastSpecies(): Promise<BeastSpecies[]> {
  return apiCache.get("beast-species", {}, async () => {
    const res = await collectablesClient.beasts.species();
    return res.items;
  });
}

export type BeastSupply = {
  speciesCount: number;
  /** speciesCount × 1,243 */
  totalSupply: number;
  /** tier → max supply */
  byTier: Record<number, number>;
  /** tier → species count */
  speciesPerTier: Record<number, number>;
};

/** Max supply derived from the species catalog (v3 grows as species register). */
export async function fetchBeastSupply(): Promise<BeastSupply> {
  const species = await fetchBeastSpecies();
  const speciesPerTier: Record<number, number> = {};
  for (const s of species) speciesPerTier[s.tier] = (speciesPerTier[s.tier] ?? 0) + 1;
  const byTier: Record<number, number> = {};
  for (const [tier, n] of Object.entries(speciesPerTier)) byTier[Number(tier)] = n * MAX_BEASTS_PER_TYPE;
  return {
    speciesCount: species.length,
    totalSupply: species.length * MAX_BEASTS_PER_TYPE,
    byTier,
    speciesPerTier,
  };
}

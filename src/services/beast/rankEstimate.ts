/**
 * Estimated species rank for beasts the collectables API hasn't ranked yet.
 *
 * Rank is a beast's position within its species by power (1 = strongest);
 * the API reports 0 for beasts minted after its last ranking pass. Until that
 * catches up we estimate: 1 + the number of ranked beasts of the same species
 * with strictly more power. Results are cached per (species, power).
 */
import { apiCache } from "../apiCache";
import { collectablesClient } from "./collectablesClient";

export async function estimateSpeciesRank(speciesId: number, power: number): Promise<number | null> {
  if (!Number.isFinite(speciesId) || !Number.isFinite(power) || speciesId <= 0) return null;
  return apiCache.get("rank-estimate", { speciesId, power }, async () => {
    const stronger = await collectablesClient.beasts.list({
      beastId: speciesId,
      powerGte: Math.floor(power) + 1,
      rankGte: 1,
      limit: 1,
    });
    return 1 + (stronger.total ?? 0);
  });
}

/** Most unranked beasts to estimate for one owner's highlights (bounds API calls). */
export const MAX_RANK_ESTIMATES_PER_OWNER = 25;

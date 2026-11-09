import type { Beast } from "../services/beast";
import { getNumericAttribute } from "./beast";

/** "all" or a tier 1-5. */
export type TierFilter = "all" | number;
/** "all", "top10" (ranks 1-10) or one rank 1-10. Rank 1 is the species' King. */
export type RankFilter = "all" | "top10" | number;

export const TIER_OPTIONS = [1, 2, 3, 4, 5];
export const RANK_OPTIONS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

export const tierOf = (b: Beast): number | null => getNumericAttribute(b, "Tier");
/** Rank 0 means unranked (Genesis / not yet ranked). */
export const rankOf = (b: Beast): number | null => {
  const r = getNumericAttribute(b, "Rank");
  return r != null && r > 0 ? r : null;
};

export function matchesTierFilter(b: Beast, f: TierFilter): boolean {
  return f === "all" || tierOf(b) === f;
}

export function matchesRankFilter(b: Beast, f: RankFilter): boolean {
  if (f === "all") return true;
  const r = rankOf(b);
  if (r == null) return false;
  return f === "top10" ? r <= 10 : r === f;
}

export function tierFilterLabel(f: TierFilter): string {
  return f === "all" ? "All" : `Tier ${f}`;
}

export function rankFilterLabel(f: RankFilter): string {
  return f === "all" ? "All" : f === "top10" ? "Top 10" : f === 1 ? "Rank 1 (King)" : `Rank ${f}`;
}

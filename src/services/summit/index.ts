import { computeSummitBeastData, mapSummitRow } from "./helpers";
import { buildSummitBeastQuery } from "./queries";
import { runSummitSql } from "./sqlClient";
import type { RawSummitRow, SummitBeastData } from "./types";

export type { SummitBeastData, SummitLiveStats } from "./types";
export {
  MAX_BONUS_HEALTH,
  MAX_BONUS_LEVELS,
  REVIVAL_COOLDOWN_SECONDS,
} from "./constants";

export async function fetchSummitBeastData(
  tokenId: number
): Promise<SummitBeastData> {
  // Validate tokenId
  if (!tokenId || tokenId <= 0 || !Number.isFinite(tokenId)) {
    console.warn(`[Summit] Invalid tokenId: ${tokenId}`);
    return computeSummitBeastData(tokenId || 0, null);
  }

  try {
    const query = buildSummitBeastQuery(tokenId);
    const rows = await runSummitSql<RawSummitRow[]>(
      query,
      `summit-beast-${tokenId}`
    );

    if (!rows || rows.length === 0) {
      console.debug(`[Summit] No data found for tokenId: ${tokenId}`);
      return computeSummitBeastData(tokenId, null);
    }

    const liveStats = mapSummitRow(rows[0]);
    console.debug(`[Summit] Loaded data for tokenId: ${tokenId}`, {
      attackStreak: liveStats.attackStreak,
      blocksHeld: liveStats.blocksHeld,
      bonusHealth: liveStats.bonusHealth,
    });
    return computeSummitBeastData(tokenId, liveStats);
  } catch (error) {
    console.error(`[Summit] Failed to fetch beast data for ${tokenId}:`, error);
    return computeSummitBeastData(tokenId, null);
  }
}

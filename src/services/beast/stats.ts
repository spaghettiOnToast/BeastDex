import { BEAST_STATS_CACHE_TTL_MS } from "./constants";
import { collectablesClient } from "./collectablesClient";
import type { BeastStats } from "./types";

let statsCache: { data: BeastStats; expiresAt: number } | null = null;

export async function fetchBeastStats(forceRefresh = false): Promise<BeastStats> {
  const now = Date.now();
  if (!forceRefresh && statsCache && statsCache.expiresAt > now) {
    return statsCache.data;
  }

  const raw = await collectablesClient.beasts.stats();

  const mintedCount =
    typeof raw["total"] === "number" ? raw["total"] : 0;

  const data: BeastStats = {
    mintedCount,
    uniqueOwners: 0,
    fetchedAt: now,
  };

  statsCache = { data, expiresAt: now + BEAST_STATS_CACHE_TTL_MS };

  return data;
}

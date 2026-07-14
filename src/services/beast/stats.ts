import { BEAST_STATS_CACHE_TTL_MS } from "./constants";
import { collectablesClient } from "./collectablesClient";
import type { BeastStats } from "./types";

let statsCache: { data: BeastStats; expiresAt: number } | null = null;

export async function fetchBeastStats(forceRefresh = false): Promise<BeastStats> {
  const now = Date.now();
  if (!forceRefresh && statsCache && statsCache.expiresAt > now) {
    return statsCache.data;
  }

  const page = await collectablesClient.beasts.list({ limit: 1 });
  const mintedCount = page.total;

  const data: BeastStats = {
    mintedCount,
    uniqueOwners: 0,
    fetchedAt: now,
  };

  statsCache = { data, expiresAt: now + BEAST_STATS_CACHE_TTL_MS };

  return data;
}

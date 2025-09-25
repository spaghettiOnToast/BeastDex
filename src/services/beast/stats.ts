import { BEAST_STATS_CACHE_TTL_MS } from "./constants";
import { buildBeastStatsQuery } from "./queries";
import { runBeastSql } from "./sqlClient";
import type { BeastStats } from "./types";

let statsCache: { data: BeastStats; expiresAt: number } | null = null;

function parseNumber(value: unknown): number {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }

  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

export async function fetchBeastStats(forceRefresh = false): Promise<BeastStats> {
  const now = Date.now();
  if (!forceRefresh && statsCache && statsCache.expiresAt > now) {
    return statsCache.data;
  }

  const query = buildBeastStatsQuery();
  const rows = await runBeastSql<
    Array<{ minted_count: number | string; unique_owners: number | string }>
  >(query, "fetchBeastStats");

  const statsRow = rows?.[0];
  const mintedCount = parseNumber(statsRow?.minted_count);
  const uniqueOwners = parseNumber(statsRow?.unique_owners);

  const data: BeastStats = {
    mintedCount,
    uniqueOwners,
    fetchedAt: now,
  };

  statsCache = {
    data,
    expiresAt: now + BEAST_STATS_CACHE_TTL_MS,
  };

  return data;
}

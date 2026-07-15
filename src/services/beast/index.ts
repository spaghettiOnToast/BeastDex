import { mapSdkBeast, hasCompleteMetadata } from "./helpers";
export { hasCompleteMetadata };
import { collectablesClient } from "./collectablesClient";
import {
  BEAST_NAMES,
  ITEM_NAME_PREFIXES,
  ITEM_NAME_SUFFIXES,
  beastType,
  beastTier,
  normalizeAddress,
} from "@provable-games/collectables";
import type { BeastQuery } from "@provable-games/collectables";
import { normaliseStarknetAddress } from "../../utils/address";
import { EXCLUDED_OWNER_ADDRESS } from "./constants";

// ─── Cursor cache for SDK page emulation ────────────────────────────────────
// Maps stable query key → Map<page, nextCursor from that page>
const _beastCursorCache = new Map<string, Map<number, string | null>>();

// Module-level cache for Slayer leaderboard (excludes EXCLUDED_OWNER_ADDRESS)
type SlayerCache = { timestamp: number; entries: import("./types").BeastSlayerEntry[] };
let _slayerCache: SlayerCache | null = null;
const SLAYER_CACHE_TTL_MS = 5 * 60 * 1000;

// Module-level cache for Beast of the Day (24h window, sorted client-side)
type BotdEntry = { rank: number; beast: import("./types").Beast; owner: string; rarity_score: number; power: number; beast_rank: number; last_death: number };
let _beastOfTheDayCache: { timestamp: number; entries: BotdEntry[] } | null = null;
const BOTD_CACHE_TTL_MS = 3 * 60 * 1000;

function _sdkQueryKey(q: BeastQuery): string {
  return JSON.stringify(q, Object.keys(q as object).sort());
}

function _getCursor(q: BeastQuery, page: number): string | undefined {
  const cursors = _beastCursorCache.get(_sdkQueryKey(q));
  const c = cursors?.get(page - 1);
  return c ?? undefined;
}

function _setCursor(q: BeastQuery, page: number, cursor: string | null) {
  const key = _sdkQueryKey(q);
  if (!_beastCursorCache.has(key)) _beastCursorCache.set(key, new Map());
  _beastCursorCache.get(key)!.set(page, cursor);
}

// ─── Sort / filter mapping ───────────────────────────────────────────────────
function _mapSort(sort: string): { sort: BeastQuery["sort"]; order: "asc" | "desc" } {
  switch (sort) {
    case "beast": return { sort: "name", order: "asc" };
    case "tier": return { sort: "tier", order: "asc" };
    case "health": return { sort: "health", order: "desc" };
    case "rank": return { sort: "rank", order: "asc" };
    case "last-death": return { sort: "last_death_timestamp", order: "desc" };
    default: return { sort: "power", order: "desc" };
  }
}

type AttributeFiltersInput = Record<string, Array<string | number>>;

function _mapAttributeFilters(filters: AttributeFiltersInput): Partial<BeastQuery> {
  const q: Partial<BeastQuery> = {};
  for (const [trait, values] of Object.entries(filters)) {
    if (!values || values.length === 0) continue;
    const key = trait.toLowerCase();
    if (key === "type") {
      q.typeIn = values as ("Magic" | "Hunter" | "Brute")[];
    } else if (key === "tier") {
      q.tierIn = values.map(Number);
    } else if (key === "beast" || key === "name") {
      q.nameIn = values.map(String);
    } else if (key === "prefix") {
      q.prefixNameIn = values.map(String);
    } else if (key === "suffix") {
      q.suffixNameIn = values.map(String);
    } else if (key === "shiny") {
      if (values.some((v) => v === "true" || v === "1" || v === 1)) q.shiny = true;
      else q.shiny = false;
    } else if (key === "animated") {
      if (values.some((v) => v === "true" || v === "1" || v === 1)) q.animated = true;
      else q.animated = false;
    } else if (key === "health" && values.length >= 2) {
      q.healthGte = Number(values[0]);
      q.healthLte = Number(values[1]);
    } else if (key === "level" && values.length >= 2) {
      q.levelGte = Number(values[0]);
      q.levelLte = Number(values[1]);
    } else if (key === "rank") {
      const nums = values.map(Number).filter((n) => Number.isFinite(n) && n > 0);
      if (nums.length > 0) {
        q.rankGte = Math.min(...nums);
        q.rankLte = Math.max(...nums);
      }
    } else if (key === "adventurers killed" && values.length >= 2) {
      q.adventurersKilledGte = Number(values[0]);
      q.adventurersKilledLte = Number(values[1]);
    }
  }
  return q;
}

function _parseTokenId(id: string | number): number | null {
  const s = String(id).trim().toLowerCase();
  if (/^\d+$/.test(s)) return parseInt(s, 10);
  if (/^0x[0-9a-f]+$/.test(s)) return parseInt(s, 16);
  if (s.includes(":")) {
    const tail = s.slice(s.lastIndexOf(":") + 1);
    if (/^0x[0-9a-f]+$/.test(tail)) return parseInt(tail, 16);
  }
  return null;
}
import type {
  Beast,
  BeastAttributeFilters,
  FetchBeastsOptions,
  FetchLeaderboardOptions,
  BeastSlayerEntry,
} from "./types";
import { fetchBeastStats } from "./stats";
import { fetchBeastHighlights, fetchBeastCollectedByName } from "./highlights";
export type { BeastNameCount } from "./highlights";
import { apiCache } from "../apiCache";

export { TOTAL_BEAST_SUPPLY, MAX_BEASTS_PER_TYPE, MAX_BEASTS_PER_TIER } from "./constants";
export { fetchBeastStats, fetchBeastHighlights, fetchBeastCollectedByName };
export type {
  AttributeFilterInput,
  Beast,
  BeastAttribute,
  BeastAttributeFilters,
  BeastHighlights,
  BeastHighlightsLeader,
  BeastMetadata,
  BeastSortField,
  BeastStats,
  FetchLeaderboardOptions,
  BeastSlayerEntry,
} from "./types";

export type OwnerBeastStats = {
  totalBeasts: number;
  totalPower: number;
  uniqueBeastTypes: number;
  uniqueTiers: number;
  maxPower: number;
};

export type FetchBeastsResponse = {
  beasts: Beast[];
  total: number;
};

export async function fetchBeasts({
  limit = 20,
  search = "",
  attributeFilters = {},
  ownerAddresses = [],
  page = 1,
  sort = "default",
}: FetchBeastsOptions = {}): Promise<FetchBeastsResponse> {
  const { sort: sdkSort, order } = _mapSort(sort);
  const filterParams = _mapAttributeFilters(attributeFilters as AttributeFiltersInput);

  const ownerAddress = ownerAddresses?.length === 1 ? normalizeAddress(ownerAddresses[0]) : null;

  const baseQuery: BeastQuery = {
    ...filterParams,
    ...(search ? { search } : {}),
    sort: sdkSort,
    order,
    limit: Math.min(limit, ownerAddress ? 1000 : 100),
    includeOwner: true,
  };

  const cursor = _getCursor(baseQuery, page);
  const sdkQuery: BeastQuery = cursor ? { ...baseQuery, cursor } : baseQuery;

  const result = ownerAddress
    ? await collectablesClient.beasts.byOwner(ownerAddress, sdkQuery)
    : await collectablesClient.beasts.list(sdkQuery);
  _setCursor(baseQuery, page, result.nextCursor);

  return {
    beasts: result.items.map(mapSdkBeast),
    total: result.total,
  };
}

/**
 * Fetch top N beasts by power - optimized for fast initial page load.
 * Cached aggressively (30 min) since top beasts rarely change.
 * Use this for the initial render, then load full paginated data in background.
 */
export async function fetchTopBeasts(limit: number = 10): Promise<Beast[]> {
  return apiCache.get("top-beasts", { limit }, async () => {
    const result = await collectablesClient.beasts.list({
      sort: "power",
      order: "desc",
      limit,
      includeOwner: true,
    });
    return result.items.map(mapSdkBeast);
  });
}

/**
 * Derives hex token ID(s) from an identifier.
 * Returns both padded (64-char) and unpadded versions for numeric IDs
 * to handle different storage formats in the database.
 */
export function deriveTokenHex(identifier: string): string[] {
  const trimmed = identifier.trim();
  if (trimmed.length === 0) {
    return [];
  }

  const numericMatch = /^\d+$/.test(trimmed);
  if (numericMatch) {
    try {
      const hex = BigInt(trimmed).toString(16);
      const unpadded = `0x${hex}`;
      const padded = `0x${hex.padStart(64, "0")}`;
      // Return both formats to handle different database storage
      return [unpadded, padded];
    } catch (error) {
      console.warn(
        "⚠️ Failed to derive token hex from numeric id",
        error,
        trimmed
      );
      return [];
    }
  }

  if (trimmed.includes(":")) {
    const tail = trimmed.slice(trimmed.lastIndexOf(":") + 1);
    if (/^0x[0-9a-f]+$/i.test(tail)) {
      const hex = tail.toLowerCase().startsWith("0x")
        ? tail.toLowerCase()
        : `0x${tail.toLowerCase()}`;
      return [hex];
    }
  }

  if (/^0x[0-9a-f]+$/i.test(trimmed)) {
    return [trimmed.toLowerCase()];
  }

  return [];
}

export async function fetchBeastById(
  id: string | number
): Promise<Beast | null> {
  const tokenId = _parseTokenId(id);
  if (tokenId === null || tokenId <= 0) return null;

  return apiCache.get("beast-by-id", { id: tokenId }, async () => {
    try {
      const sdkBeast = await collectablesClient.beasts.get(tokenId);
      return mapSdkBeast(sdkBeast);
    } catch {
      return null;
    }
  });
}

export async function fetchBeastsByIds(
  ids: Array<string | number>
): Promise<Beast[]> {
  const numericIds = Array.from(
    new Set(
      ids
        .map(_parseTokenId)
        .filter((id): id is number => id !== null && id > 0)
    )
  );

  if (numericIds.length === 0) return [];

  const BATCH_SIZE = 100;
  const batches: number[][] = [];
  for (let i = 0; i < numericIds.length; i += BATCH_SIZE) {
    batches.push(numericIds.slice(i, i + BATCH_SIZE));
  }

  const results = await Promise.all(
    batches.map((batch) =>
      collectablesClient.beasts
        .list({ tokenIdIn: batch, limit: BATCH_SIZE, includeOwner: true })
        .then((page) => page.items.map(mapSdkBeast))
    )
  );

  return results.flat();
}

export async function fetchBeastAttributeFilters(): Promise<BeastAttributeFilters> {
  // Static filters derived from SDK constants — no network call needed.
  const beastIdNums = Array.from(
    new Set(Object.keys(BEAST_NAMES).map(Number))
  ).sort((a, b) => a - b);

  const uniqueNames = Array.from(new Set(Object.values(BEAST_NAMES))).sort();
  const uniqueTypes = Array.from(
    new Set(beastIdNums.map((id) => beastType(id)))
  ).sort();
  const uniqueTiers = Array.from(
    new Set(beastIdNums.map((id) => beastTier(id)))
  )
    .sort((a, b) => a - b)
    .map(String);

  const uniquePrefixes = Array.from(new Set(Object.values(ITEM_NAME_PREFIXES))).sort();
  const uniqueSuffixes = Array.from(new Set(Object.values(ITEM_NAME_SUFFIXES))).sort();

  return {
    Beast: uniqueNames,
    Type: uniqueTypes,
    Tier: uniqueTiers,
    Prefix: uniquePrefixes,
    Suffix: uniqueSuffixes,
    Shiny: ["true", "false"],
    Animated: ["true", "false"],
  };
}


export async function fetchBeastOfTheDayLeaderboard({
  limit = 10,
  offset = 0,
}: FetchLeaderboardOptions = {}): Promise<Array<{
  rank: number;
  beast: Beast;
  owner: string;
  rarity_score: number;
  power: number;
  beast_rank: number;
  last_death: number;
}>> {
  const now = Date.now();

  if (!_beastOfTheDayCache || now - _beastOfTheDayCache.timestamp > BOTD_CACHE_TTL_MS) {
    const twentyFourHoursAgo = Math.floor(now / 1000) - 24 * 60 * 60;

    const result = await collectablesClient.beasts.list({
      lastDeathTimestampGte: twentyFourHoursAgo,
      sort: "power",
      order: "desc",
      limit: 100,
      includeOwner: true,
    });

    const sorted = result.items
      .map((item) => {
        const isShiny = Boolean(item.shiny);
        const isAnimated = Boolean(item.animated);
        return {
          beast: mapSdkBeast(item),
          owner: item.owner ?? "",
          rarity_score: isShiny && isAnimated ? 3 : isShiny || isAnimated ? 2 : 1,
          power: item.power ?? 0,
          beast_rank: item.rank ?? 999999,
          last_death: item.lastDeathTimestamp ?? 0,
        };
      })
      .sort(
        (a, b) =>
          b.rarity_score - a.rarity_score ||
          b.power - a.power ||
          a.beast_rank - b.beast_rank
      )
      .map((entry, idx) => ({ ...entry, rank: idx + 1 }));

    _beastOfTheDayCache = { timestamp: now, entries: sorted };
  }

  return _beastOfTheDayCache.entries.slice(offset, offset + limit);
}

export async function fetchBeastSlayerLeaderboard({
  limit = 10,
  offset = 0,
}: FetchLeaderboardOptions = {}): Promise<BeastSlayerEntry[]> {
  const now = Date.now();

  if (!_slayerCache || now - _slayerCache.timestamp > SLAYER_CACHE_TTL_MS) {
    const result = await collectablesClient.beasts.list({
      sort: "adventurers_killed",
      order: "desc",
      adventurersKilledGte: 1,
      limit: 100,
      includeOwner: true,
    });

    const excludedAddr = normalizeAddress(EXCLUDED_OWNER_ADDRESS);
    const entries = result.items
      .filter((item) => !item.owner || normalizeAddress(item.owner) !== excludedAddr)
      .map((item, idx) => ({
        rank: idx + 1,
        beastId: String(item.tokenId),
        beastName: mapSdkBeast(item).name,
        beastRank: item.rank ?? 0,
        owner: item.owner ?? null,
        kills: item.adventurersKilled ?? 0,
      }));

    _slayerCache = { timestamp: now, entries };
  }

  return _slayerCache.entries.slice(offset, offset + limit);
}

export async function fetchOwnerBeastStats(
  ownerAddress: string
): Promise<OwnerBeastStats> {
  const normalised = normaliseStarknetAddress(ownerAddress);
  if (!normalised) {
    return { totalBeasts: 0, totalPower: 0, uniqueBeastTypes: 0, uniqueTiers: 0, maxPower: 0 };
  }

  return apiCache.get("owner-beast-stats", { address: normalised }, async () => {
    try {
      const stats = await collectablesClient.beasts.ownerStats(
        normalizeAddress(normalised)
      );
      return {
        totalBeasts: stats.total,
        totalPower: 0,
        uniqueBeastTypes: stats.uniqueBeastIds,
        uniqueTiers: 0,
        maxPower: stats.bounds?.power[1] ?? 0,
      };
    } catch {
      return { totalBeasts: 0, totalPower: 0, uniqueBeastTypes: 0, uniqueTiers: 0, maxPower: 0 };
    }
  });
}

export type TierCollectionStats = {
  tier: number;
  collected: number;
};

export async function fetchTierCollectionStats(): Promise<TierCollectionStats[]> {
  return apiCache.get("tier-collection-stats", {}, async () => {
    const results = await Promise.all(
      [1, 2, 3, 4, 5].map(async (tier) => {
        const page = await collectablesClient.beasts.list({ tier, limit: 1 });
        return { tier, collected: page.total };
      })
    );
    return results.sort((a, b) => b.tier - a.tier);
  });
}

/**
 * Fetch highlight beasts for an owner (rarest, highest ranked, last collected)
 * Combined into a single SQL query for better performance
 */
export type OwnerBeastHighlights = {
  rarest: Beast | null;
  highestRanked: Beast | null;
  lastCollected: Beast | null;
  lastCollectedName: string | null;
};

export async function fetchOwnerBeastHighlights(
  ownerAddress: string
): Promise<OwnerBeastHighlights> {
  const normalised = normaliseStarknetAddress(ownerAddress);
  if (!normalised) {
    return {
      rarest: null,
      highestRanked: null,
      lastCollected: null,
      lastCollectedName: null,
    };
  }

  return apiCache.get("owner-beast-highlights", { address: normalised }, async () => {
    const addr = normalizeAddress(normalised);

    const [animatedShiny, shinyOnly, animatedOnly, highestRanked, lastCollected] =
      await Promise.all([
        collectablesClient.beasts.byOwner(addr, { shiny: true, animated: true, sort: "power", order: "desc", limit: 1 }),
        collectablesClient.beasts.byOwner(addr, { shiny: true, animated: false, sort: "power", order: "desc", limit: 1 }),
        collectablesClient.beasts.byOwner(addr, { shiny: false, animated: true, sort: "power", order: "desc", limit: 1 }),
        collectablesClient.beasts.byOwner(addr, { sort: "rank", order: "asc", limit: 1 }),
        collectablesClient.beasts.byOwner(addr, { sort: "last_death_timestamp", order: "desc", limit: 1 }),
      ]);

    // Rarest: animated+shiny > shiny-only > animated-only > null
    const rarestItem = animatedShiny.items[0] ?? shinyOnly.items[0] ?? animatedOnly.items[0] ?? null;
    const highestRankedItem = highestRanked.items[0] ?? null;
    const lastCollectedItem = lastCollected.items[0] ?? null;

    const lastCollectedBeast = lastCollectedItem ? mapSdkBeast(lastCollectedItem) : null;

    return {
      rarest: rarestItem ? mapSdkBeast(rarestItem) : null,
      highestRanked: highestRankedItem ? mapSdkBeast(highestRankedItem) : null,
      lastCollected: lastCollectedBeast,
      lastCollectedName: lastCollectedBeast?.name ?? null,
    };
  });
}

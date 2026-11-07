import {
  mapSdkBeast,
  hasCompleteMetadata,
  beastVisual,
  beastRarityScore,
  VISUAL_TO_EFFECTS,
} from "./helpers";
export { hasCompleteMetadata, beastVisual, beastRarityScore };
import { collectablesClient } from "./collectablesClient";
import {
  ITEM_NAME_PREFIXES,
  ITEM_NAME_SUFFIXES,
  beastsV3,
  normalizeAddress,
} from "@provable-games/collectables";
import type { BeastQuery } from "@provable-games/collectables";
import { normaliseStarknetAddress } from "../../utils/address";
import { toTokenIdString, toTokenIdHex, toTokenIdHexPadded } from "../../utils/tokenId";
import { EXCLUDED_OWNER_ADDRESS, CARD_GRADE_MIN, CARD_GRADE_MAX } from "./constants";
import { fetchBeastSpecies } from "./species";
import type { BeastVisual } from "./types";

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

/** Boolean filter values are stored as "1"/"0" (see fetchBeastAttributeFilters). */
function _boolFilter(values: Array<string | number>): boolean {
  return values.some((v) => v === "true" || v === "1" || v === 1);
}

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
    } else if (key === "visual") {
      const effects = values
        .map((v) => VISUAL_TO_EFFECTS[String(v) as BeastVisual])
        .filter((n): n is number => typeof n === "number");
      if (effects.length > 0) q.visualEffectsIn = effects;
    } else if (key === "card grade") {
      // [min, max] range, or a single value meaning "at least".
      const lo = Number(values[0]);
      const hi = values.length >= 2 ? Number(values[1]) : CARD_GRADE_MAX;
      if (Number.isFinite(lo) && lo > CARD_GRADE_MIN) q.cardGradeGte = lo;
      if (Number.isFinite(hi) && hi < CARD_GRADE_MAX) q.cardGradeLte = hi;
    } else if (key === "soulbound") {
      if (_boolFilter(values)) q.transferLockHours = beastsV3.SOULBOUND_TRANSFER_LOCK;
      else q.transferLockHoursLte = beastsV3.SOULBOUND_TRANSFER_LOCK - 1;
    } else if (key === "genesis") {
      q.genesis = _boolFilter(values);
    } else if (key === "mega") {
      q.mega = _boolFilter(values);
    } else if (key === "midi") {
      q.midi = _boolFilter(values);
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

import { MAX_BEASTS_PER_TYPE } from "./constants";
export { MAX_BEASTS_PER_TYPE, CARD_GRADE_MIN, CARD_GRADE_MAX } from "./constants";
export { fetchBeastSpecies, fetchBeastSupply } from "./species";
export type { BeastSupply } from "./species";
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
  BeastVisual,
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
  const unpadded = toTokenIdHex(identifier);
  const padded = toTokenIdHexPadded(identifier);
  if (!unpadded || !padded) return [];
  // Return both formats to handle different database storage
  return unpadded === padded ? [unpadded] : [unpadded, padded];
}

export async function fetchBeastById(
  id: string | number
): Promise<Beast | null> {
  const tokenId = toTokenIdString(id);
  if (tokenId === null) return null;

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
  const tokenIds = Array.from(
    new Set(
      ids
        .map((id) => toTokenIdString(id))
        .filter((id): id is string => id !== null)
    )
  );

  if (tokenIds.length === 0) return [];

  // The API rejects token_id_in arrays over 50 elements outright (400), so
  // this must stay <= 50 — it's not just a page size.
  const BATCH_SIZE = 50;
  const batches: string[][] = [];
  for (let i = 0; i < tokenIds.length; i += BATCH_SIZE) {
    batches.push(tokenIds.slice(i, i + BATCH_SIZE));
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

/**
 * All Genesis beasts (one per species). Legacy genesis were token ids 1-75;
 * v3 genesis is prefix 0 + suffix 0 with packed ids, so query the flag.
 */
export async function fetchGenesisBeasts(): Promise<Beast[]> {
  return apiCache.get("genesis-beasts", {}, async () => {
    const out: Beast[] = [];
    let cursor: string | undefined;
    do {
      const page = await collectablesClient.beasts.list({
        genesis: true,
        limit: 100,
        includeOwner: true,
        ...(cursor ? { cursor } : {}),
      });
      out.push(...page.items.map(mapSdkBeast));
      cursor = page.nextCursor ?? undefined;
    } while (cursor);
    return out;
  });
}

export async function fetchBeastAttributeFilters(): Promise<BeastAttributeFilters> {
  // Species come from the v3 registry (open-ended, may exceed the original 75);
  // prefixes/suffixes are fixed SDK constants.
  const species = await fetchBeastSpecies();

  const uniqueNames = Array.from(new Set(species.map((s) => s.name))).sort();
  const uniqueTypes = Array.from(new Set(species.map((s) => s.type))).sort();
  const uniqueTiers = Array.from(new Set(species.map((s) => s.tier)))
    .sort((a, b) => a - b)
    .map(String);

  const uniquePrefixes = Array.from(new Set(Object.values(ITEM_NAME_PREFIXES))).sort();
  const uniqueSuffixes = Array.from(new Set(Object.values(ITEM_NAME_SUFFIXES))).sort();

  const grades: string[] = [];
  for (let g = CARD_GRADE_MIN; g <= CARD_GRADE_MAX; g++) grades.push(String(g));

  return {
    Beast: uniqueNames,
    Type: uniqueTypes,
    Tier: uniqueTiers,
    Prefix: uniquePrefixes,
    Suffix: uniqueSuffixes,
    Visual: Object.keys(VISUAL_TO_EFFECTS),
    "Card Grade": grades,
    // Boolean toggles must use "1"/"0" — FiltersDrawer's boolean-toggle
    // detection and _boolFilter both key off that format.
    Soulbound: ["1", "0"],
    Genesis: ["1", "0"],
    Mega: ["1", "0"],
    MIDI: ["1", "0"],
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
        const beast = mapSdkBeast(item);
        return {
          beast,
          owner: item.owner ?? "",
          rarity_score: beastRarityScore(beast),
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
        beastId: toTokenIdString(item.tokenId) ?? String(item.tokenId),
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
  /** max supply for the tier: species in tier × MAX_BEASTS_PER_TYPE */
  maxSupply: number;
};

export async function fetchTierCollectionStats(): Promise<TierCollectionStats[]> {
  return apiCache.get("tier-collection-stats", {}, async () => {
    const species = await fetchBeastSpecies();
    const results = await Promise.all(
      [1, 2, 3, 4, 5].map(async (tier) => {
        const page = await collectablesClient.beasts.list({ tier, limit: 1 });
        const speciesInTier = species.filter((s) => s.tier === tier).length;
        return { tier, collected: page.total, maxSupply: speciesInTier * MAX_BEASTS_PER_TYPE };
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
        collectablesClient.beasts.byOwner(addr, { visualEffects: VISUAL_TO_EFFECTS["Shiny Animated"], sort: "power", order: "desc", limit: 1 }),
        collectablesClient.beasts.byOwner(addr, { visualEffects: VISUAL_TO_EFFECTS.Shiny, sort: "power", order: "desc", limit: 1 }),
        collectablesClient.beasts.byOwner(addr, { visualEffects: VISUAL_TO_EFFECTS.Animated, sort: "power", order: "desc", limit: 1 }),
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

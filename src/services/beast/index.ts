import {
  mapSdkBeast,
  hasCompleteMetadata,
  beastVisual,
  beastRarityScore,
  VISUAL_TO_EFFECTS,
} from "./helpers";
export { hasCompleteMetadata, beastVisual, beastRarityScore };
import { collectablesClient, legacyCollectablesClient } from "./collectablesClient";
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
const SLAYER_CACHE_TTL_MS = 5 * 60 * 1000;


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
    case "rank-desc": return { sort: "rank", order: "desc" };
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
      // [min, max] range, or a single value meaning "at least"; [g, g] = exactly g.
      const lo = Number(values[0]);
      const hi = values.length >= 2 ? Number(values[1]) : CARD_GRADE_MAX;
      if (values.length >= 2 && Number.isFinite(lo) && lo === hi) {
        q.cardGrade = lo;
      } else {
        if (Number.isFinite(lo) && lo > CARD_GRADE_MIN) q.cardGradeGte = lo;
        if (Number.isFinite(hi) && hi < CARD_GRADE_MAX) q.cardGradeLte = hi;
      }
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

  // Rank sort: the API orders rank 0 (not ranked yet) before rank 1, so page
  // through ranked beasts first and append the unranked ones after them.
  if (sdkSort === "rank") {
    return _fetchRankSorted(ownerAddress, baseQuery, page);
  }

  const result = await _fetchPage(ownerAddress, baseQuery, page);
  return {
    beasts: result.items.map(mapSdkBeast),
    total: result.total,
  };
}

/** One emulated page of a query (cursor chained from the previous page). */
async function _fetchPage(ownerAddress: string | null, baseQuery: BeastQuery, page: number) {
  const cursor = _getCursor(baseQuery, page);
  const sdkQuery: BeastQuery = cursor ? { ...baseQuery, cursor } : baseQuery;
  const result = ownerAddress
    ? await collectablesClient.beasts.byOwner(ownerAddress, sdkQuery)
    : await collectablesClient.beasts.list(sdkQuery);
  _setCursor(baseQuery, page, result.nextCursor);
  return result;
}

/** Most unranked beasts appended to a rank-sorted list (there are ~100 in total). */
const MAX_UNRANKED_APPENDED = 2000;

/** Every unranked (rank 0) beast matching `baseQuery`, strongest first. */
function _fetchAllUnranked(ownerAddress: string | null, baseQuery: BeastQuery) {
  const query: BeastQuery = { ...baseQuery, rank: 0, sort: "power", order: "desc" };
  delete query.rankGte;
  delete query.rankLte;
  return apiCache.get("beast-query", { unranked: true, ownerAddress, query }, async () => {
    const items: Awaited<ReturnType<typeof collectablesClient.beasts.list>>["items"] = [];
    let cursor: string | undefined;
    do {
      const q: BeastQuery = cursor ? { ...query, cursor } : query;
      const r = ownerAddress
        ? await collectablesClient.beasts.byOwner(ownerAddress, q)
        : await collectablesClient.beasts.list(q);
      items.push(...r.items);
      cursor = r.nextCursor ?? undefined;
    } while (cursor && items.length < MAX_UNRANKED_APPENDED);
    return items;
  });
}

/** Ranked-beast totals per query, so pages past the ranked set skip that request. */
const _rankedTotals = new Map<string, number>();

async function _fetchRankSorted(
  ownerAddress: string | null,
  baseQuery: BeastQuery,
  page: number
): Promise<FetchBeastsResponse> {
  const limit = baseQuery.limit ?? 20;
  const start = (page - 1) * limit;
  // A rank filter (always >= 1) already excludes unranked beasts.
  const rankFiltered = baseQuery.rankGte != null && baseQuery.rankGte >= 1;
  const rankedQuery: BeastQuery = { ...baseQuery, rankGte: Math.max(1, baseQuery.rankGte ?? 1) };
  const rankedKey = _sdkQueryKey(rankedQuery) + (ownerAddress ?? "");

  let rankedItems: Awaited<ReturnType<typeof collectablesClient.beasts.list>>["items"] = [];
  let rankedTotal = _rankedTotals.get(rankedKey);
  if (rankedTotal === undefined || start < rankedTotal) {
    const r = await _fetchPage(ownerAddress, rankedQuery, page);
    rankedItems = r.items;
    rankedTotal = r.total;
    _rankedTotals.set(rankedKey, rankedTotal);
  }

  const unranked = rankFiltered ? [] : await _fetchAllUnranked(ownerAddress, baseQuery);
  const need = limit - rankedItems.length;
  const unrankedStart = Math.max(0, start - rankedTotal);
  const unrankedItems = need > 0 ? unranked.slice(unrankedStart, unrankedStart + need) : [];

  return {
    beasts: [...rankedItems, ...unrankedItems].map(mapSdkBeast),
    total: rankedTotal + unranked.length,
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


/** How many legacy slayers the leaderboard covers (per order). */
const SLAYER_POOL_SIZE = 100;
const _slayerPools = new Map<string, { timestamp: number; items: SdkLegacyBeast[] }>();
type SdkLegacyBeast = Awaited<ReturnType<typeof legacyCollectablesClient.beasts.list>>["items"][number];
type SdkV3Beast = Awaited<ReturnType<typeof collectablesClient.beasts.list>>["items"][number];
const _v3ByAffixes = new Map<string, SdkV3Beast | null>();

/**
 * The v3 token of a legacy beast: legacy beasts are unique per species +
 * prefix + suffix, and the unnamed ones are the species' Genesis beast.
 */
async function findV3Twin(legacy: SdkLegacyBeast): Promise<SdkV3Beast | null> {
  const named = Boolean(legacy.prefixName && legacy.suffixName);
  const key = named ? `${legacy.beastId}|${legacy.prefixName}|${legacy.suffixName}` : `${legacy.beastId}|genesis`;
  if (_v3ByAffixes.has(key)) return _v3ByAffixes.get(key) ?? null;
  try {
    const r = await collectablesClient.beasts.list({
      beastId: legacy.beastId,
      ...(named ? { prefixName: legacy.prefixName!, suffixName: legacy.suffixName! } : { genesis: true }),
      limit: 1,
      includeOwner: true,
    });
    const twin = r.items[0] ?? null;
    _v3ByAffixes.set(key, twin);
    return twin;
  } catch {
    return null; // not cached: retry next time
  }
}

/**
 * All-time Slayer leaderboard. v3 reset adventurer kills at the migration, so
 * kills come from the legacy collection (ranked there), plus any v3 kills since;
 * each entry shows the beast's current v3 token, owner and rank.
 */
export async function fetchBeastSlayerLeaderboard({
  limit = 10,
  offset = 0,
  order = "desc",
  includeGenesis = false,
}: FetchLeaderboardOptions = {}): Promise<BeastSlayerEntry[]> {
  const now = Date.now();
  const poolKey = `${order}|${includeGenesis ? "all" : "named"}`;
  let pool = _slayerPools.get(poolKey);
  if (!pool || now - pool.timestamp > SLAYER_CACHE_TTL_MS) {
    const result = await legacyCollectablesClient.beasts.list({
      sort: "adventurers_killed",
      order,
      adventurersKilledGte: 1,
      // Genesis beasts (one per species, all held by one wallet) dominate the
      // all-time kills; hidden unless asked for
      ...(includeGenesis ? {} : { genesis: false }),
      limit: SLAYER_POOL_SIZE,
      includeOwner: true,
    });
    pool = { timestamp: now, items: result.items };
    _slayerPools.set(poolKey, pool);
  }

  const slice = pool.items.slice(offset, offset + limit);
  const twins: Array<SdkV3Beast | null> = [];
  for (let i = 0; i < slice.length; i += 10) {
    twins.push(...(await Promise.all(slice.slice(i, i + 10).map(findV3Twin))));
  }

  const excludedAddr = normalizeAddress(EXCLUDED_OWNER_ADDRESS);
  return slice
    .map((legacy, i) => {
      const twin = twins[i];
      const owner = twin?.owner ?? legacy.owner ?? null;
      return {
        rank: offset + i + 1,
        beastId: twin ? toTokenIdString(twin.tokenId) ?? String(twin.tokenId) : String(legacy.tokenId),
        beastName: mapSdkBeast((twin ?? legacy) as SdkV3Beast).name,
        beastRank: twin?.rank ?? legacy.rank ?? 0,
        owner,
        kills: (legacy.adventurersKilled ?? 0) + (twin?.adventurersKilled ?? 0),
        inV3: Boolean(twin),
        genesis: Boolean(twin?.genesis ?? legacy.genesis),
      };
    })
    .filter((e) => !e.owner || normalizeAddress(e.owner) !== excludedAddr);
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

/** Card grades shown on the Statistics tab (0 = ungraded). */
export const STAT_CARD_GRADES = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const;

/** Number of beasts at each card grade (grade -> count), cached 30 min. */
export async function fetchCardGradeCounts(): Promise<Record<number, number>> {
  return apiCache.get("beast-grade-counts", {}, async () => {
    const totals = await Promise.all(
      STAT_CARD_GRADES.map((cardGrade) =>
        collectablesClient.beasts.list({ cardGrade, limit: 1 }).then((r) => r.total ?? 0)
      )
    );
    return Object.fromEntries(STAT_CARD_GRADES.map((g, i) => [g, totals[i]]));
  });
}

export type CollectionGlance = {
  holders: number;
  totalBeasts: number;
  midi: number;
  genesis: number;
  /** shiny + animated shiny */
  shiny: number;
  /** Grade 10 + Animated Shiny */
  perfectCards: number;
  strongest: Beast | null;
  topName: { label: string; count: number } | null;
  topPrefix: { label: string; count: number } | null;
};

/** Collection-wide figures for the Statistics tab (cached 10 min). */
export async function fetchCollectionGlance(): Promise<CollectionGlance> {
  return apiCache.get("collection-glance", {}, async () => {
    const [stats, perfect, strongest, names, prefixes] = await Promise.all([
      collectablesClient.beasts.stats(),
      collectablesClient.beasts.list({ cardGrade: 10, visualEffects: VISUAL_TO_EFFECTS["Shiny MIDI"], limit: 1 }),
      collectablesClient.beasts.list({ sort: "power", order: "desc", limit: 1, includeOwner: true }),
      collectablesClient.beasts.groups({ groupBy: "full_name", limit: 5 }),
      collectablesClient.beasts.groups({ groupBy: "prefix", limit: 5 }),
    ]);
    const num = (v: unknown) => (typeof v === "number" ? v : Number(v) || 0);
    // "__none__" = beasts without a special name
    const top = (groups: typeof names) => {
      const g = groups.items.find((x) => x.key !== "__none__");
      return g ? { label: g.label.replace(/^"|"$/g, ""), count: g.count } : null;
    };
    return {
      holders: num(stats.holders),
      totalBeasts: num(stats.totalTokens),
      midi: num(stats.midi),
      genesis: num(stats.genesis),
      shiny: num(stats.shiny),
      perfectCards: perfect.total ?? 0,
      strongest: strongest.items[0] ? mapSdkBeast(strongest.items[0]) : null,
      topName: top(names),
      topPrefix: top(prefixes),
    };
  });
}

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
  /** How many of the rarest beast's species are collected game-wide. */
  rarestSpeciesCollected?: number | null;
  highestRanked: Beast | null;
  lastCollected: Beast | null;
  lastCollectedName: string | null;
};

type SdkOwnedBeast = Awaited<ReturnType<typeof collectablesClient.beasts.byOwner>>["items"][number];

/**
 * Rarest-first comparison for an owner's beasts (negative = `a` is rarer):
 * 1. visual: Shiny MIDI > Shiny > MIDI > Standard
 * 2. higher card grade
 * 3. least collected species game-wide (`collectedBySpecies`, by species name)
 * 4. better species rank (1 best; unranked last), then higher power
 */
export function compareOwnedRarity(
  a: OwnedRarityInput,
  b: OwnedRarityInput,
  collectedBySpecies: ReadonlyMap<string, number> = new Map()
): number {
  const visual = (x: OwnedRarityInput) => (x.shiny && x.animated ? 3 : x.shiny ? 2 : x.animated ? 1 : 0);
  const collected = (x: OwnedRarityInput) => collectedBySpecies.get(x.name ?? "") ?? Number.POSITIVE_INFINITY;
  const rank = (x: OwnedRarityInput) => (x.rank != null && x.rank >= 1 ? x.rank : Number.POSITIVE_INFINITY);
  return (
    visual(b) - visual(a) ||
    (b.cardGrade ?? -1) - (a.cardGrade ?? -1) ||
    cmp(collected(a), collected(b)) ||
    cmp(rank(a), rank(b)) ||
    (b.power ?? 0) - (a.power ?? 0)
  );
}

export type OwnedRarityInput = {
  name?: string | null;
  rank?: number | null;
  cardGrade?: number | null;
  shiny?: boolean | null;
  animated?: boolean | null;
  power?: number | null;
};

/** Ascending compare that copes with Infinity. */
const cmp = (x: number, y: number) => (x === y ? 0 : x < y ? -1 : 1);

/** Highest of `items` by `key`, ties broken by higher power. */
function maxBy<T extends { power?: number | null }>(items: T[], key: (t: T) => number): T | null {
  let best: T | null = null;
  let bestKey = -Infinity;
  for (const item of items) {
    const k = key(item);
    if (k > bestKey || (k === bestKey && best && (item.power ?? 0) > (best.power ?? 0))) {
      best = item;
      bestKey = k;
    }
  }
  return best;
}

/** Owner highlights computed from their full holding (one owner-scoped query). */
export function pickOwnerHighlights(items: SdkOwnedBeast[], collectedBySpecies: ReadonlyMap<string, number> = new Map()) {
  const ranked = items.filter((b) => (b.rank ?? 0) >= 1);
  // v3 shiny/animated live in visualEffects; beastVisual normalises both formats
  let rarest: SdkOwnedBeast | null = null;
  for (const item of items) {
    if (!rarest || compareOwnedRarity({ ...item, ...beastVisual(item) }, { ...rarest, ...beastVisual(rarest) }, collectedBySpecies) < 0) {
      rarest = item;
    }
  }
  return {
    rarest,
    // rank 1 is the best; unranked (0) beasts can't be "highest ranked"
    highestRanked: maxBy(ranked, (b) => -(b.rank ?? 0)),
    lastCollected: maxBy(items, (b) => Number(b.lastDeathTimestamp ?? 0)),
  };
}

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

    // Owner-scoped queries return the whole holding by default. Species
    // collected counts rank equally rare beasts (least collected wins); without
    // them the pick falls back to species rank.
    const [{ items }, collectedCounts] = await Promise.all([
      collectablesClient.beasts.byOwner(addr, {}),
      fetchBeastCollectedByName().catch(() => []),
    ]);
    const collectedBySpecies = new Map(collectedCounts.map((c) => [c.name, c.collected]));
    const { rarest: rarestItem, highestRanked: highestRankedItem, lastCollected: lastCollectedItem } =
      pickOwnerHighlights(items, collectedBySpecies);

    const lastCollectedBeast = lastCollectedItem ? mapSdkBeast(lastCollectedItem) : null;

    return {
      rarest: rarestItem ? mapSdkBeast(rarestItem) : null,
      rarestSpeciesCollected: rarestItem ? collectedBySpecies.get(rarestItem.name) ?? null : null,
      highestRanked: highestRankedItem ? mapSdkBeast(highestRankedItem) : null,
      lastCollected: lastCollectedBeast,
      lastCollectedName: lastCollectedBeast?.name ?? null,
    };
  });
}

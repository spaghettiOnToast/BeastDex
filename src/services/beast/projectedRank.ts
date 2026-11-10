import type { Beast as SdkBeast } from "@provable-games/collectables";
import { collectablesClient } from "./collectablesClient";

/**
 * Projected ranks for v3 beasts, until the collectables API ships a
 * `projectedRank` field.
 *
 * On-chain ranks only change when someone calls `update_rankings`, which
 * nobody has done since the v3 migration (2026-11-03), so new mints read rank
 * 0. Within a species the on-chain order is level desc, then health desc, then
 * the earlier mint (this matched all 86,082 ranked beasts on 2026-11-09).
 * Genesis beasts are never ranked.
 *
 * Every new (rank 0) beast was minted after every ranked one, so:
 * - a ranked beast moves down one place for each new beast of its species
 *   that is strictly stronger (a tie goes to the ranked beast's earlier mint);
 * - a new beast ranks after the ranked beasts at least as strong as it and
 *   after the new beasts stronger than it.
 */

/** The fields of a new (rank 0) beast that decide where it ranks. */
export type NewBeastEntry = {
  tokenId: string;
  beastId: number;
  level: number;
  health: number;
  mintedAtBlock: number;
  mintedAtMinute: number;
  /** Ranked beasts of its species at least as strong (level, then health). */
  rankedAbove: number;
};

/** New beasts per species, strongest first. */
export type ProjectionTable = Map<number, NewBeastEntry[]>;

type RankInput = Pick<SdkBeast, "tokenId" | "beastId" | "level" | "health" | "rank" | "genesis">;

function compareNew(a: NewBeastEntry, b: NewBeastEntry): number {
  return (
    b.level - a.level ||
    b.health - a.health ||
    a.mintedAtBlock - b.mintedAtBlock ||
    a.mintedAtMinute - b.mintedAtMinute ||
    (BigInt(a.tokenId) < BigInt(b.tokenId) ? -1 : BigInt(a.tokenId) > BigInt(b.tokenId) ? 1 : 0)
  );
}

export function buildProjectionTable(entries: NewBeastEntry[]): ProjectionTable {
  const table: ProjectionTable = new Map();
  for (const e of entries) {
    const list = table.get(e.beastId) ?? [];
    list.push(e);
    table.set(e.beastId, list);
  }
  for (const list of table.values()) list.sort(compareNew);
  return table;
}

/** The beast's projected rank, or null when it has none (Genesis, or rank 0 not in the table). */
export function projectRank(table: ProjectionTable, beast: RankInput): number | null {
  if (beast.genesis) return null;
  const news = table.get(beast.beastId) ?? [];
  if (beast.rank > 0) {
    const stronger = news.filter(
      (n) => n.level > beast.level || (n.level === beast.level && n.health > beast.health)
    ).length;
    return beast.rank + stronger;
  }
  const idx = news.findIndex((n) => n.tokenId === beast.tokenId);
  if (idx < 0) return null;
  return news[idx].rankedAbove + idx + 1;
}

// ─── Loading ────────────────────────────────────────────────────────────────

/** How long a loaded table is used before the new-beast list is fetched again. */
const REFRESH_MS = 5 * 60 * 1000;
/** Longest a beast fetch waits for the first table before showing on-chain ranks. */
const WAIT_MS = 4000;
/** Delay before retrying a failed load. */
const RETRY_MS = 60 * 1000;
const COUNT_CONCURRENCY = 4;
/**
 * tokenId → rankedAbove. Safe to keep: a beast stays rank 0 only while the
 * ranked set of its species is unchanged (`update_rankings` must rank every
 * minted beast at once).
 */
const STORAGE_KEY = "beastdex.rankedAbove.v1";

let table: ProjectionTable | null = null;
let loadedAt = 0;
let inflight: Promise<void> | null = null;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (e) {
      const status = (e as { status?: number }).status;
      if (status !== 429 || attempt >= 4) throw e;
      await sleep(1000 * (attempt + 1));
    }
  }
}

function readStored(): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}") ?? {};
  } catch {
    return {};
  }
}

function writeStored(map: Record<string, number>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    // storage unavailable: the counts are fetched again next visit
  }
}

async function countRankedAbove(b: SdkBeast): Promise<number> {
  const [higherLevel, sameLevel] = await Promise.all([
    withRetry(() => collectablesClient.beasts.list({ beastId: b.beastId, rankGte: 1, levelGte: b.level + 1, limit: 1 })),
    withRetry(() => collectablesClient.beasts.list({ beastId: b.beastId, rankGte: 1, level: b.level, healthGte: b.health, limit: 1 })),
  ]);
  return higherLevel.total + sameLevel.total;
}

async function load(): Promise<void> {
  const fresh: SdkBeast[] = [];
  let cursor: string | undefined;
  do {
    const page = await withRetry(() =>
      collectablesClient.beasts.list({ rank: 0, genesis: false, limit: 100, ...(cursor ? { cursor } : {}) })
    );
    fresh.push(...page.items);
    cursor = page.nextCursor ?? undefined;
  } while (cursor);

  const stored = readStored();
  const kept: Record<string, number> = {};
  const missing = fresh.filter((b) => stored[b.tokenId] == null);
  for (let i = 0; i < missing.length; i += COUNT_CONCURRENCY) {
    const batch = missing.slice(i, i + COUNT_CONCURRENCY);
    const counts = await Promise.all(batch.map(countRankedAbove));
    batch.forEach((b, j) => (stored[b.tokenId] = counts[j]));
  }
  // Keep only beasts that are still unranked, so the stored map stays small.
  for (const b of fresh) kept[b.tokenId] = stored[b.tokenId];
  writeStored(kept);

  table = buildProjectionTable(
    fresh.map((b) => ({
      tokenId: b.tokenId,
      beastId: b.beastId,
      level: b.level,
      health: b.health,
      mintedAtBlock: b.mintedAtBlock ?? 0,
      mintedAtMinute: b.mintedAtMinute ?? 0,
      rankedAbove: kept[b.tokenId],
    }))
  );
  loadedAt = Date.now();
}

/**
 * Load (or refresh) the projection table. The first load is awaited up to
 * WAIT_MS; after that a stale table is used while a refresh runs. On failure
 * beasts keep their on-chain ranks.
 */
export async function ensureProjectedRanks(): Promise<void> {
  const stale = Date.now() - loadedAt > REFRESH_MS;
  if (stale && !inflight) {
    inflight = load()
      .catch((e) => {
        console.warn("[projectedRank] load failed; showing on-chain ranks", e);
        loadedAt = Date.now() - REFRESH_MS + RETRY_MS; // try again in a minute, not on every fetch
      })
      .finally(() => (inflight = null));
  }
  if (table || !inflight) return;
  await Promise.race([inflight, sleep(WAIT_MS)]);
}

/** Projected rank from the loaded table, or null when none is loaded / applicable. */
export function projectedRankFor(beast: RankInput): number | null {
  return table ? projectRank(table, beast) : null;
}

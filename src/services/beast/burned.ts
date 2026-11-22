/**
 * Burned Beasts tokens. The v3 API keeps a token after it is burned (a Loot
 * beast transformed into its Mega, or taken in the Loot Dungeon) and lists it
 * with no owner, so its counts, groups and stats all include dead tokens.
 *
 * `withoutBurned` wraps the API client so every list, count, group and stats
 * figure leaves them out. Burned tokens are found by scanning the Loot species
 * (the only ones the Loot Dungeon burns) for ownerless tokens; the API's
 * `totalTokens - ownedTokens` says how many there should be.
 */
import { beastsV3, type BeastQuery, type CollectablesClient } from "@provable-games/collectables";

type Beasts = CollectablesClient["beasts"];
type SdkBeast = Awaited<ReturnType<Beasts["list"]>>["items"][number];
type GroupPage = Awaited<ReturnType<Beasts["groups"]>>;
type GroupQuery = Parameters<Beasts["groups"]>[0];
type ListQuery = NonNullable<Parameters<Beasts["list"]>[0]>;
type Stats = Awaited<ReturnType<Beasts["stats"]>>;

const CACHE_MS = 5 * 60 * 1000;
const PAGE = 100;

/** Query keys that don't filter tokens. */
const NON_FILTER_KEYS = new Set(["sort", "order", "limit", "cursor", "includeOwner", "groupBy"]);

function isOwnerless(owner: unknown): boolean {
  if (owner == null || owner === "") return true;
  try {
    return BigInt(owner as string) === 0n;
  } catch {
    return false;
  }
}

const lower = (v: unknown) => (typeof v === "string" ? v.toLowerCase() : v);

/**
 * Whether a token matches an API query, judged locally. `null` when the query
 * uses a filter that can't be judged here (the caller then leaves the figure as is).
 */
export function matchesQuery(item: SdkBeast, query: object): boolean | null {
  const it = item as unknown as Record<string, unknown>;
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || NON_FILTER_KEYS.has(key)) continue;
    if (key === "owner") return false; // burned tokens have no owner
    if (key === "search") {
      const needle = String(value).toLowerCase();
      const hay = [item.name, item.prefixName, item.suffixName].filter(Boolean).join(" ").toLowerCase();
      if (!hay.includes(needle)) return false;
      continue;
    }
    const m = /^(.*?)(Gte|Lte|In)?$/.exec(key)!;
    const field = m[1];
    const op = m[2];
    if (!(field in it)) return null;
    const actual = it[field];
    if (op === "In") {
      const list = (Array.isArray(value) ? value : String(value).split(",")).map((v) => String(lower(v)));
      if (!list.includes(String(lower(actual)))) return false;
    } else if (op === "Gte") {
      if (!(Number(actual) >= Number(value))) return false;
    } else if (op === "Lte") {
      if (!(Number(actual) <= Number(value))) return false;
    } else if (typeof value === "boolean") {
      if (Boolean(actual) !== value) return false;
    } else if (String(lower(actual)) !== String(lower(value))) {
      return false;
    }
  }
  return true;
}

/** How many burned tokens a query would count, or `null` if it can't be judged. */
export function countBurned(burned: readonly SdkBeast[], query: object): number | null {
  let n = 0;
  for (const b of burned) {
    const hit = matchesQuery(b, query);
    if (hit === null) return null;
    if (hit) n++;
  }
  return n;
}

/** A token's key in each `groupBy` grouping, as the API labels it ("__none__" = no special name). */
export function groupKey(item: SdkBeast, groupBy: string): string {
  switch (groupBy) {
    case "beast_id":
      return String(item.beastId);
    case "type":
      return String(item.type);
    case "tier":
      return String(item.tier);
    case "prefix":
      return item.prefixName ?? "__none__";
    case "suffix":
      return item.suffixName ?? "__none__";
    case "full_name":
      return item.prefixName && item.suffixName ? `"${item.prefixName} ${item.suffixName}"` : "__none__";
    default:
      return "";
  }
}

/** A list page without burned tokens; the total loses every burned token the query matches. */
export function adjustList<P extends { items: SdkBeast[]; total: number }>(
  page: P,
  query: Partial<BeastQuery>,
  burned: readonly SdkBeast[],
  burnedIds: ReadonlySet<string>,
): P {
  // Lookups by token id (e.g. the Loot Bag's lost cards) and owner queries are left alone.
  if (burned.length === 0 || query.tokenId != null || query.tokenIdIn != null || query.owner != null) return page;
  const items = page.items.filter((b) => !burnedIds.has(b.tokenId));
  const n = countBurned(burned, query);
  return { ...page, items, total: n === null ? page.total : Math.max(0, page.total - n) };
}

/** Group counts without burned tokens: emptied groups dropped, count order kept. */
export function adjustGroups(page: GroupPage, query: GroupQuery, burned: readonly SdkBeast[]): GroupPage {
  if (burned.length === 0) return page;
  const matching = burned.filter((b) => matchesQuery(b, query) === true);
  if (matching.length === 0) return page;
  const byKey = new Map<string, SdkBeast[]>();
  for (const b of matching) {
    const k = groupKey(b, query.groupBy);
    byKey.set(k, [...(byKey.get(k) ?? []), b]);
  }
  const items = page.items
    .map((g) => {
      const dead = byKey.get(g.key);
      if (!dead) return g;
      const out = { ...g, count: g.count - dead.length } as typeof g & Record<string, unknown>;
      const rec = g as unknown as Record<string, unknown>;
      if (typeof rec.shinyCount === "number") out.shinyCount = rec.shinyCount - dead.filter((b) => b.shiny).length;
      if (typeof rec.midiCount === "number") out.midiCount = rec.midiCount - dead.filter((b) => b.midi).length;
      if (typeof rec.animatedCount === "number") out.animatedCount = rec.animatedCount - dead.filter((b) => b.animated).length;
      return out;
    })
    .filter((g) => g.count > 0);
  // Keep a count-ordered page in count order.
  const byCount = page.items.every((g, i) => i === 0 || page.items[i - 1].count >= g.count);
  if (byCount) items.sort((a, b) => b.count - a.count);
  const removed = page.items.length - items.length;
  const total = (page as { total?: number }).total;
  return { ...page, items, ...(typeof total === "number" ? { total: total - removed } : {}) };
}

/** Collection stats without burned tokens. */
export function adjustStats(stats: Stats, burned: readonly SdkBeast[]): Stats {
  const s = stats as unknown as Record<string, unknown>;
  const out: Record<string, unknown> = { ...s };
  if (typeof s.ownedTokens === "number") out.totalTokens = s.ownedTokens;
  const minus = (field: string, pred: (b: SdkBeast) => boolean) => {
    if (typeof s[field] === "number") out[field] = (s[field] as number) - burned.filter(pred).length;
  };
  minus("shiny", (b) => Boolean(b.shiny));
  minus("midi", (b) => Boolean(b.midi));
  minus("animated", (b) => Boolean(b.animated));
  minus("genesis", (b) => Boolean(b.genesis));
  return out as unknown as Stats;
}

const LOOT_SPECIES_IDS = Array.from({ length: 255 }, (_, i) => i + 1).filter((id) => beastsV3.isLootSpecies(id));

/** Every burned token: ownerless tokens of the Loot species, when the API's own stats say some exist. */
async function scanBurned(raw: Beasts): Promise<SdkBeast[]> {
  const stats = (await raw.stats()) as unknown as Record<string, unknown>;
  const expected = Number(stats.totalTokens) - Number(stats.ownedTokens);
  if (!(expected > 0)) return [];
  const perSpecies = await Promise.all(
    LOOT_SPECIES_IDS.map(async (beastId) => {
      const out: SdkBeast[] = [];
      let cursor: string | undefined;
      do {
        const page = await raw.list({ beastId, includeOwner: true, limit: PAGE, ...(cursor ? { cursor } : {}) });
        for (const b of page.items) if (isOwnerless((b as { owner?: unknown }).owner)) out.push(b);
        cursor = page.nextCursor ?? undefined;
      } while (cursor);
      return out;
    }),
  );
  const burned = perSpecies.flat();
  if (burned.length !== expected) {
    console.warn(`[burned] found ${burned.length} burned Loot tokens, API stats imply ${expected}`);
  }
  return burned;
}

/** Wraps a client's `beasts` so lists, counts, groups and stats leave out burned tokens. */
export function withoutBurned(client: CollectablesClient): CollectablesClient {
  const raw = client.beasts;
  let cache: { at: number; value: Promise<{ burned: SdkBeast[]; ids: Set<string> }> } | null = null;
  const registry = () => {
    if (!cache || Date.now() - cache.at > CACHE_MS) {
      const value = scanBurned(raw)
        .then((burned) => ({ burned, ids: new Set(burned.map((b) => b.tokenId)) }))
        .catch((err) => {
          console.warn("[burned] couldn't load burned tokens, counts may include them:", err);
          cache = null;
          return { burned: [] as SdkBeast[], ids: new Set<string>() };
        });
      cache = { at: Date.now(), value };
    }
    return cache.value;
  };

  const beasts: Beasts = {
    ...raw,
    list: async (query: ListQuery = {}) => {
      const [page, reg] = await Promise.all([raw.list(query), registry()]);
      return adjustList(page, query, reg.burned, reg.ids);
    },
    groups: async (query: GroupQuery) => {
      const [page, reg] = await Promise.all([raw.groups(query), registry()]);
      return adjustGroups(page, query, reg.burned);
    },
    stats: async () => {
      const [stats, reg] = await Promise.all([raw.stats(), registry()]);
      return adjustStats(stats, reg.burned);
    },
  };
  // `beasts` is a readonly field on the SDK client; swap in the wrapped methods.
  Object.defineProperty(client, "beasts", { value: beasts });
  return client;
}

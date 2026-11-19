/**
 * Collection figures for the Loot Dungeon beasts (species 78-107), for the
 * Statistics → Loot Beasts tab. The API's collection-wide `stats()` can't be
 * filtered by species, so every Loot beast is fetched (≈1k, pages of 100) and
 * counted here. Genesis beasts (one per species, all Shiny MIDI grade 10, one
 * holder) are left out so they don't skew the figures. Beasts staked for Mega are held by the Loot Dungeon contract:
 * holders count their stakers instead.
 */
import type { Beast as SdkBeast } from "@provable-games/collectables";
import { collectablesClient } from "./beast/collectablesClient";
import { fetchBeastSpecies } from "./beast/species";
import { beastVisual, mapSdkBeast } from "./beast/helpers";
import type { Beast, BeastVisual } from "./beast/types";
import { apiCache } from "./apiCache";
import { fetchAllLootStakes, isLootDungeon, lootSpecies, type LootStake } from "./lootDungeon";

const PAGE = 100; // API max
const MAX_PAGES = 100;

export type LootBeastStats = {
  /** non-Genesis Loot beasts */
  total: number;
  /** Genesis beasts left out of every other figure */
  genesis: number;
  visuals: Record<BeastVisual, number>;
  holders: number;
  /** staked for Mega right now */
  staked: number;
  /** stakes whose Mega transform time has passed */
  megaReady: number;
  /** unix seconds of the next stake to reach Mega, or null */
  nextMegaAt: number | null;
  grade10: number;
  /** highest power; `owner` is the staker when it's in the Loot Bag */
  strongest: Beast | null;
  strongestStaked: boolean;
  topName: { label: string; count: number } | null;
  topPrefix: { label: string; count: number } | null;
};

function top(counts: Map<string, number>): { label: string; count: number } | null {
  let best: { label: string; count: number } | null = null;
  for (const [label, count] of counts) if (!best || count > best.count) best = { label, count };
  return best;
}

const bump = (m: Map<string, number>, k: string) => m.set(k, (m.get(k) ?? 0) + 1);

/** Pure tally of Loot beasts (staker by token id for beasts the Loot Dungeon holds). */
export function tallyLootBeasts(
  items: readonly SdkBeast[],
  stakes: readonly LootStake[],
  nowSec = Date.now() / 1000,
): LootBeastStats {
  const stakerOf = new Map(stakes.map((s) => [s.tokenId, s.staker]));
  const pending = stakes.map((s) => s.transformsAt).filter((t) => t > nowSec);
  const visuals: Record<BeastVisual, number> = { Regular: 0, Shiny: 0, MIDI: 0, "Shiny MIDI": 0 };
  const holders = new Set<string>();
  const names = new Map<string, number>();
  const prefixes = new Map<string, number>();
  let genesis = 0, staked = 0, grade10 = 0;
  let strongest: { beast: SdkBeast; owner: string | null; staked: boolean } | null = null;

  for (const b of items) {
    if (b.genesis) {
      genesis++;
      continue;
    }
    let owner = b.owner ?? null;
    const isStaked = isLootDungeon(owner);
    if (isStaked) {
      staked++;
      owner = stakerOf.get(String(b.tokenId)) ?? owner;
    }
    if (owner && BigInt(owner) !== 0n) holders.add(BigInt(owner).toString(16));

    const { visual } = beastVisual({ ...b, beastId: b.beastId });
    visuals[visual]++;
    if (b.cardGrade === 10) grade10++;
    if (b.prefixName && b.suffixName) bump(names, `${b.prefixName} ${b.suffixName}`);
    if (b.prefixName) bump(prefixes, b.prefixName);
    if (!strongest || (b.power ?? 0) > (strongest.beast.power ?? 0)) strongest = { beast: b, owner, staked: isStaked };
  }

  return {
    total: items.length - genesis,
    genesis,
    visuals,
    holders: holders.size,
    staked,
    megaReady: stakes.length - pending.length,
    nextMegaAt: pending.length ? Math.min(...pending) : null,
    grade10,
    strongest: strongest ? { ...mapSdkBeast(strongest.beast), owner: strongest.owner } : null,
    strongestStaked: strongest?.staked ?? false,
    topName: top(names),
    topPrefix: top(prefixes),
  };
}

export function fetchLootBeastStats(): Promise<LootBeastStats> {
  return apiCache.get("loot-beast-stats", {}, async () => {
    const species = lootSpecies(await fetchBeastSpecies()).map((s) => s.speciesId);
    const [items, stakes] = await Promise.all([
      (async () => {
        const all: SdkBeast[] = [];
        let cursor: string | undefined;
        for (let page = 0; page < MAX_PAGES; page++) {
          const res = await collectablesClient.beasts.list({ beastIdIn: species, includeOwner: true, limit: PAGE, cursor });
          all.push(...res.items);
          if (!res.nextCursor) break;
          cursor = res.nextCursor;
        }
        return all;
      })(),
      fetchAllLootStakes().catch((err) => {
        console.warn("[loot stats] stakes unavailable, counting the Loot Dungeon as holder:", err);
        return [] as LootStake[];
      }),
    ]);
    return tallyLootBeasts(items, stakes);
  });
}

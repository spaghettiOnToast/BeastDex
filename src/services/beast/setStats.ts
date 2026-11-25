/**
 * Collection progress split by species set: the Originals (every species
 * outside a dungeon set, incl. the festival one-offs), the Loot Dungeon beasts
 * (78-107) and the Abstract Dungeon beasts (108-122).
 * Each figure is a `limit: 1` count query filtered to the set's species.
 *
 * Loot visuals differ: shiny art only comes from a staked beast reaching its
 * Mega form (presets 2/3), so Loot counts Mega / MIDI / Standard, without the
 * Genesis beasts (all Shiny MIDI, one holder) that would otherwise be the only
 * "shinies". Abstract beasts use the classic renderer, so they get the
 * Originals' tiles, also without their Genesis beasts.
 */
import type { BeastQuery } from "@provable-games/collectables";
import { apiCache } from "../apiCache";
import { collectablesClient } from "./collectablesClient";
import { MAX_BEASTS_PER_TYPE } from "./constants";
import { visualsQuery } from "./presets";
import { fetchBeastSpecies } from "./species";
import { lootSpecies } from "../lootDungeon";
import { abstractSpecies } from "../abstractDungeon";
import type { TierCollectionStats } from "./index";

export type CollectionSet = "original" | "loot" | "abstract";

export type VisualCount = { label: string; value: number };

export type SetCollectionStats = {
  set: CollectionSet;
  label: string;
  collected: number;
  maxSupply: number;
  /** tier 5 → 1, as the tier panel shows them */
  tiers: TierCollectionStats[];
  /** the set's visual tiles, rarest first */
  visuals: VisualCount[];
  /** attribute filters that narrow beast lists to the set (the dungeon sets leave out Genesis) */
  filters: Record<string, string[]>;
};

const SET_LABELS: Record<CollectionSet, string> = { original: "Originals", loot: "Loot Beasts", abstract: "Abstract Beasts" };

async function count(q: Partial<BeastQuery>): Promise<number> {
  return (await collectablesClient.beasts.list({ ...q, limit: 1 })).total ?? 0;
}

/**
 * Species filter for a set. The API caps `beastIdIn` at 50 ids, so a set whose
 * ids are one contiguous run (Originals 1-77, Loot 78-107, Abstract 108-122) is sent as a range.
 */
export function speciesFilter(speciesIds: readonly number[]): Partial<BeastQuery> {
  const sorted = [...speciesIds].sort((a, b) => a - b);
  const lo = sorted[0], hi = sorted[sorted.length - 1];
  if (sorted.length > 0 && hi - lo + 1 === sorted.length) return { beastIdGte: lo, beastIdLte: hi };
  return { beastIdIn: sorted };
}

async function setStats(set: CollectionSet, speciesIds: number[], tierOf: Map<number, number>): Promise<SetCollectionStats> {
  // The dungeon sets' Genesis beasts (all Shiny MIDI, one holder) would skew their visual tiles;
  // tier progress still counts them, as max supply does.
  const noGenesis = set !== "original";
  const inSet = speciesFilter(speciesIds);
  const base: Partial<BeastQuery> = { ...inSet, ...(noGenesis ? { genesis: false } : {}) };
  const visualQueries: Array<[string, Partial<BeastQuery>]> =
    set === "loot"
      ? [
          ["Mega", { ...base, visualEffectsIn: [2, 3] }],
          ["MIDI", { ...base, visualEffectsIn: [1] }],
          ["Standard", { ...base, visualEffectsIn: [0] }],
        ]
      : [
          ["Shiny MIDI", { ...base, ...visualsQuery(["Shiny MIDI"]) }],
          ["Shiny", { ...base, ...visualsQuery(["Shiny"]) }],
          ["MIDI", { ...base, ...visualsQuery(["MIDI"]) }],
          ["Standard", { ...base, ...visualsQuery(["Regular"]) }],
        ];

  const tierNums = [5, 4, 3, 2, 1];
  const [tiers, visuals] = await Promise.all([
    Promise.all(
      tierNums.map(async (tier) => {
        const ids = speciesIds.filter((id) => tierOf.get(id) === tier);
        const collected = ids.length ? await count({ ...inSet, tier }) : 0;
        return { tier, collected, maxSupply: ids.length * MAX_BEASTS_PER_TYPE };
      }),
    ),
    Promise.all(visualQueries.map(async ([label, q]) => ({ label, value: await count(q) }))),
  ]);

  return {
    set,
    label: SET_LABELS[set],
    collected: tiers.reduce((s, t) => s + t.collected, 0),
    maxSupply: tiers.reduce((s, t) => s + t.maxSupply, 0),
    tiers,
    visuals,
    filters: {
      "Species Id": [String(Math.min(...speciesIds)), String(Math.max(...speciesIds))],
      ...(noGenesis ? { Genesis: ["0"] } : {}),
    },
  };
}

/** Originals, Loot Beasts and Abstract Beasts collection stats, cached like the other collection figures. */
export function fetchSetCollectionStats(): Promise<SetCollectionStats[]> {
  return apiCache.get("set-collection-stats", {}, async () => {
    const species = await fetchBeastSpecies();
    const loot = new Set(lootSpecies(species).map((s) => s.speciesId));
    const abstract = new Set(abstractSpecies(species).map((s) => s.speciesId));
    const tierOf = new Map(species.map((s) => [s.speciesId, s.tier]));
    const originals = species.map((s) => s.speciesId).filter((id) => !loot.has(id) && !abstract.has(id));
    return Promise.all([
      setStats("original", originals, tierOf),
      setStats("loot", [...loot], tierOf),
      ...(abstract.size > 0 ? [setStats("abstract", [...abstract], tierOf)] : []),
    ]);
  });
}

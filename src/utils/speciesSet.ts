import { beastsV3 } from "@provable-games/collectables";

/**
 * Which release a species belongs to:
 * - original: the Loot Survivor beasts, species 1-75
 * - loot: the Loot Dungeon beasts, species 78-107
 * - festival: Tiddy Mun / Black Shuck (76-77) and any later one-offs
 */
export type SpeciesSet = "original" | "loot" | "festival";
export type SpeciesSetFilter = "all" | "original" | "loot";

export const ORIGINAL_SPECIES_LAST = 75;

export const SPECIES_SET_OPTIONS: ReadonlyArray<{ key: SpeciesSetFilter; label: string }> = [
  { key: "all", label: "All sets" },
  { key: "original", label: "Originals" },
  { key: "loot", label: "Loot Beasts" },
];

export function speciesSetOf(speciesId: number): SpeciesSet {
  if (beastsV3.isLootSpecies(speciesId)) return "loot";
  if (speciesId >= 1 && speciesId <= ORIGINAL_SPECIES_LAST) return "original";
  return "festival";
}

/**
 * Whether a species passes the set filter. An unknown species (catalog not
 * loaded yet) only passes "all".
 */
export function matchesSpeciesSet(speciesId: number | null | undefined, filter: SpeciesSetFilter): boolean {
  if (filter === "all") return true;
  if (speciesId == null || !Number.isFinite(speciesId)) return false;
  return speciesSetOf(speciesId) === filter;
}

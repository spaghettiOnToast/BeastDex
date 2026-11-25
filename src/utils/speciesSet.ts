import { beastsV3 } from "@provable-games/collectables";

/**
 * Which release a species belongs to:
 * - original: the Loot Survivor beasts, species 1-75
 * - loot: the Loot Dungeon beasts, species 78-107
 * - abstract: the Abstract Dungeon beasts, species 108-122
 * - festival: Tiddy Mun / Black Shuck (76-77) and any later one-offs
 */
export type SpeciesSet = "original" | "loot" | "abstract" | "festival";
export type SpeciesSetFilter = "all" | "original" | "loot" | "abstract";

export const ORIGINAL_SPECIES_LAST = 75;

/**
 * Abstract Dungeon species (minter 0x0181…5f50). They render on the classic
 * renderer, so unlike the Loot range the registry's renderer can't identify
 * them; lootsurvivor.io hardcodes the same 15 ids.
 */
export const ABSTRACT_SPECIES_FIRST = 108;
export const ABSTRACT_SPECIES_LAST = 122;

export function isAbstractSpecies(speciesId: number): boolean {
  return speciesId >= ABSTRACT_SPECIES_FIRST && speciesId <= ABSTRACT_SPECIES_LAST;
}

export const SPECIES_SET_OPTIONS: ReadonlyArray<{ key: SpeciesSetFilter; label: string }> = [
  { key: "all", label: "All sets" },
  { key: "original", label: "Originals" },
  { key: "loot", label: "Loot Beasts" },
  { key: "abstract", label: "Abstract Beasts" },
];

export function speciesSetOf(speciesId: number): SpeciesSet {
  if (beastsV3.isLootSpecies(speciesId)) return "loot";
  if (isAbstractSpecies(speciesId)) return "abstract";
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

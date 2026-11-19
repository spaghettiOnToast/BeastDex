/**
 * What a Beasts v3 visual preset (`visualEffects` 0-3) means is the species
 * renderer's setting, not a fixed table. The registry reports two masks per
 * species:
 *
 * - `rainbowPresets`: the alternate art (the bundled "shiny" sprite) with the
 *   rainbow rim. BeastDex labels this "Shiny".
 * - `notesPresets`: the MIDI notes background on the player page ("MIDI").
 *
 * The classic renderer (species 1-77) uses rainbow 10 / notes 12, i.e. Shiny on
 * presets 1 and 3 and MIDI on 2 and 3. The Loot Dungeon renderer (78-107)
 * swaps them: Mega art on 2 and 3, notes on 1 and 3.
 */
import { beastsV3, type BeastQuery, type BeastSpecies } from "@provable-games/collectables";
import type { BeastVisual } from "./types";

export type PresetMasks = { rainbow: number; notes: number };

export const CLASSIC_PRESET_MASKS: PresetMasks = { rainbow: 10, notes: 12 };
export const LOOT_PRESET_MASKS: PresetMasks = {
  rainbow: beastsV3.LOOT_RAINBOW_PRESETS,
  notes: beastsV3.LOOT_NOTES_PRESETS,
};

const registry = new Map<number, BeastSpecies>();

/** Called with each species catalog fetch so sync callers see the live masks. */
export function rememberSpecies(species: readonly BeastSpecies[]): void {
  for (const s of species) registry.set(s.speciesId, s);
}

/** Registry entry for a species, when the catalog has loaded. */
export function knownSpecies(speciesId: number | null | undefined): BeastSpecies | undefined {
  return speciesId == null ? undefined : registry.get(speciesId);
}

/**
 * The species' preset masks: the registry's when loaded, otherwise the mainnet
 * renderer the species id falls under (the Loot range, else classic).
 */
export function speciesPresetMasks(speciesId: number | null | undefined): PresetMasks {
  const s = knownSpecies(speciesId);
  if (s?.rainbowPresets != null && s.notesPresets != null) {
    return { rainbow: s.rainbowPresets, notes: s.notesPresets };
  }
  return speciesId != null && beastsV3.isLootSpecies(speciesId) ? LOOT_PRESET_MASKS : CLASSIC_PRESET_MASKS;
}

/** Shiny (alternate art + rainbow rim) and MIDI (notes background) for a preset. */
export function presetFlags(speciesId: number | null | undefined, visualEffects: number): { shiny: boolean; midi: boolean } {
  const masks = speciesPresetMasks(speciesId);
  return {
    shiny: beastsV3.presetSelected(masks.rainbow, visualEffects),
    midi: beastsV3.presetSelected(masks.notes, visualEffects),
  };
}

/**
 * API query for a set of visual labels, across every species. Regular is
 * always preset 0 and Shiny MIDI preset 3; Shiny and MIDI are presets 1/2,
 * told apart by the token's `midi` flag (the API derives it from the species'
 * notes mask).
 *
 * Exact unless exactly one of Shiny / MIDI is picked alongside a label of the
 * other MIDI state (e.g. Shiny + Shiny MIDI, or Regular + MIDI): the API can't
 * OR conditions, so that returns the superset (for Shiny + Shiny MIDI, presets
 * 1-3, MIDI-only beasts included).
 */
export function visualsQuery(visuals: readonly BeastVisual[]): Partial<BeastQuery> {
  const ve = new Set<number>();
  const midi = new Set<boolean>();
  for (const v of visuals) {
    if (v === "Regular") { ve.add(0); midi.add(false); }
    else if (v === "Shiny") { ve.add(1); ve.add(2); midi.add(false); }
    else if (v === "MIDI") { ve.add(1); ve.add(2); midi.add(true); }
    else if (v === "Shiny MIDI") { ve.add(3); midi.add(true); }
  }
  if (ve.size === 0) return {};
  const q: Partial<BeastQuery> = { visualEffectsIn: [...ve].sort((a, b) => a - b) };
  // midi narrows presets 1/2 only; with neither selected it adds nothing.
  if (midi.size === 1 && (ve.has(1) || ve.has(2))) q.midi = [...midi][0];
  return q;
}

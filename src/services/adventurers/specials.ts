/**
 * Item special names ("Agony Bane" … "of Power"), unlocked at greatness 15
 * (suffix) and 19 (prefixes). Mirrors the Loot Survivor client: the names
 * come from the game's `item_specials_salt` and each item's id.
 * Tables copied from the lootsurvivor.io client (Loot is CC0).
 */
import { itemSlot, type ItemSlot } from "./items";

/** Index of each item within its slot, by item id (1–101). */
const ITEM_INDEX = [2, 0, 1, 1, 2, 3, 4, 0, 10, 11, 12, 13, 14, 15, 16, 17, 0, 1, 2, 3, 4, 10, 11, 12, 13, 14, 10, 11, 12, 13, 14, 10, 11, 12, 13, 14, 10, 11, 12, 13, 14, 5, 6, 7, 8, 9, 5, 6, 7, 8, 9, 5, 6, 7, 8, 9, 5, 6, 7, 8, 9, 5, 6, 7, 8, 9, 5, 6, 7, 8, 9, 0, 1, 2, 3, 4, 10, 11, 12, 13, 14, 0, 1, 2, 3, 4, 0, 1, 2, 3, 4, 0, 1, 2, 3, 4, 0, 1, 2, 3, 4];

const SLOT_LENGTH: Record<ItemSlot, number> = {Weapon: 18, Chest: 15, Head: 15, Waist: 15, Foot: 15, Hand: 15, Neck: 3, Ring: 5};

const SUFFIXES = [
  "of Power",
  "of Giant",
  "of Titans",
  "of Skill",
  "of Perfection",
  "of Brilliance",
  "of Enlightenment",
  "of Protection",
  "of Anger",
  "of Rage",
  "of Fury",
  "of Vitriol",
  "of the Fox",
  "of Detection",
  "of Reflection",
  "of the Twins",
] as const;

const PREFIXES_1 = [
  "Agony",
  "Apocalypse",
  "Armageddon",
  "Beast",
  "Behemoth",
  "Blight",
  "Blood",
  "Bramble",
  "Brimstone",
  "Brood",
  "Carrion",
  "Cataclysm",
  "Chimeric",
  "Corpse",
  "Corruption",
  "Damnation",
  "Death",
  "Demon",
  "Dire",
  "Dragon",
  "Dread",
  "Doom",
  "Dusk",
  "Eagle",
  "Empyrean",
  "Fate",
  "Foe",
  "Gale",
  "Ghoul",
  "Gloom",
  "Glyph",
  "Golem",
  "Grim",
  "Hate",
  "Havoc",
  "Honour",
  "Horror",
  "Hypnotic",
  "Kraken",
  "Loath",
  "Maelstrom",
  "Mind",
  "Miracle",
  "Morbid",
  "Oblivion",
  "Onslaught",
  "Pain",
  "Pandemonium",
  "Phoenix",
  "Plague",
  "Rage",
  "Rapture",
  "Rune",
  "Skull",
  "Sol",
  "Soul",
  "Sorrow",
  "Spirit",
  "Storm",
  "Tempest",
  "Torment",
  "Vengeance",
  "Victory",
  "Viper",
  "Vortex",
  "Woe",
  "Wrath",
  "Lights",
  "Shimmering",
] as const;

const PREFIXES_2 = [
  "Bane",
  "Root",
  "Bite",
  "Song",
  "Roar",
  "Grasp",
  "Instrument",
  "Glow",
  "Bender",
  "Shadow",
  "Whisper",
  "Shout",
  "Growl",
  "Tear",
  "Peak",
  "Form",
  "Sun",
  "Moon",
] as const;

export const SUFFIX_UNLOCK_GREATNESS = 15;
export const PREFIX_UNLOCK_GREATNESS = 19;

function specialsSeed(itemId: number, salt: number): number {
  let entropy = salt + itemId;
  if (entropy > 65535) entropy = salt - itemId;
  const slot = itemSlot(itemId);
  return (entropy % 101) * (slot ? SLOT_LENGTH[slot] : 1) + (ITEM_INDEX[itemId - 1] ?? 0);
}

export type ItemSpecials = { suffix: string | null; prefix: string | null };

/**
 * Special names for an item at a given greatness. `prefix` is the two-word
 * name ("Agony Bane"), `suffix` the "of …" part.
 */
export function itemSpecials(itemId: number, greatness: number, salt: number): ItemSpecials {
  if (greatness < SUFFIX_UNLOCK_GREATNESS || itemId <= 0) return { suffix: null, prefix: null };
  const seed = specialsSeed(itemId, salt);
  const suffix = SUFFIXES[seed % 16] ?? null;
  if (greatness < PREFIX_UNLOCK_GREATNESS) return { suffix, prefix: null };
  const p1 = PREFIXES_1[seed % 69];
  const p2 = PREFIXES_2[seed % 18];
  return { suffix, prefix: p1 && p2 ? `${p1} ${p2}` : null };
}

/** Full display name, e.g. "Agony Bane Ghost Wand of Power". */
export function specialItemName(baseName: string, specials: ItemSpecials): string {
  return [specials.prefix, baseName, specials.suffix].filter(Boolean).join(" ");
}

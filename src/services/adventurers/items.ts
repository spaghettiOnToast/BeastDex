/**
 * Loot item table (ids 1–101, from the Loot Survivor contracts; Loot is CC0)
 * and the id-range rules for slot, type and tier. Item art is served by
 * lootsurvivor.io.
 */
import { LOOT_SURVIVOR_URL } from "../lootSurvivor";

const ITEM_NAMES = [
  "Pendant", "Necklace", "Amulet", "Silver Ring", "Bronze Ring", "Platinum Ring",
  "Titanium Ring", "Gold Ring", "Ghost Wand", "Grave Wand", "Bone Wand", "Wand",
  "Grimoire", "Chronicle", "Tome", "Book", "Divine Robe", "Silk Robe",
  "Linen Robe", "Robe", "Shirt", "Crown", "Divine Hood", "Silk Hood",
  "Linen Hood", "Hood", "Brightsilk Sash", "Silk Sash", "Wool Sash", "Linen Sash",
  "Sash", "Divine Slippers", "Silk Slippers", "Wool Shoes", "Linen Shoes", "Shoes",
  "Divine Gloves", "Silk Gloves", "Wool Gloves", "Linen Gloves", "Gloves", "Katana",
  "Falchion", "Scimitar", "Long Sword", "Short Sword", "Demon Husk", "Dragonskin Armor",
  "Studded Leather Armor", "Hard Leather Armor", "Leather Armor", "Demon Crown", "Dragons Crown", "War Cap",
  "Leather Cap", "Cap", "Demonhide Belt", "Dragonskin Belt", "Studded Leather Belt", "Hard Leather Belt",
  "Leather Belt", "Demonhide Boots", "Dragonskin Boots", "Studded Leather Boots", "Hard Leather Boots", "Leather Boots",
  "Demons Hands", "Dragonskin Gloves", "Studded Leather Gloves", "Hard Leather Gloves", "Leather Gloves", "Warhammer",
  "Quarterstaff", "Maul", "Mace", "Club", "Holy Chestplate", "Ornate Chestplate",
  "Plate Mail", "Chain Mail", "Ring Mail", "Ancient Helm", "Ornate Helm", "Great Helm",
  "Full Helm", "Helm", "Ornate Belt", "War Belt", "Plated Belt", "Mesh Belt",
  "Heavy Belt", "Holy Greaves", "Ornate Greaves", "Greaves", "Chain Boots", "Heavy Boots",
  "Holy Gauntlets", "Ornate Gauntlets", "Gauntlets", "Chain Gloves", "Heavy Gloves",
] as const;

export type ItemSlot = "Weapon" | "Chest" | "Head" | "Waist" | "Foot" | "Hand" | "Neck" | "Ring";
export type ItemType = "Magic" | "Blade" | "Bludgeon" | "Cloth" | "Hide" | "Metal" | "Necklace" | "Ring";

/** Equipment slots in display order. */
export const GEAR_SLOTS: ItemSlot[] = ["Weapon", "Head", "Chest", "Waist", "Hand", "Foot", "Neck", "Ring"];

export const itemName = (id: number): string => ITEM_NAMES[id - 1] ?? `Item #${id}`;

const inRanges = (id: number, ranges: Array<[number, number]>) => ranges.some(([a, b]) => id >= a && id <= b);
const isWeapon = (id: number) => inRanges(id, [[9, 16], [42, 46], [72, 76]]);

export function itemSlot(id: number): ItemSlot | null {
  if (id >= 1 && id <= 3) return "Neck";
  if (id >= 4 && id <= 8) return "Ring";
  if (isWeapon(id)) return "Weapon";
  if (inRanges(id, [[17, 21], [47, 51], [77, 81]])) return "Chest";
  if (inRanges(id, [[22, 26], [52, 56], [82, 86]])) return "Head";
  if (inRanges(id, [[27, 31], [57, 61], [87, 91]])) return "Waist";
  if (inRanges(id, [[32, 36], [62, 66], [92, 96]])) return "Foot";
  if (inRanges(id, [[37, 41], [67, 71], [97, 101]])) return "Hand";
  return null;
}

export function itemType(id: number): ItemType | null {
  if (id >= 1 && id <= 3) return "Necklace";
  if (id >= 4 && id <= 8) return "Ring";
  if (id >= 9 && id <= 41) return isWeapon(id) ? "Magic" : "Cloth";
  if (id >= 42 && id <= 71) return isWeapon(id) ? "Blade" : "Hide";
  if (id >= 72 && id <= 101) return isWeapon(id) ? "Bludgeon" : "Metal";
  return null;
}

/** Tier 1 (best) to 5. */
export function itemTier(id: number): number {
  if (id <= 0 || id > 101) return 0;
  if (id <= 3) return 1;
  if (id === 4) return 2;
  if (id === 5) return 3;
  if (id <= 8) return 1;
  if (id <= 41) {
    if ([9, 13, 17, 22, 27, 32, 37].includes(id)) return 1;
    if ([10, 14, 18, 23, 28, 33, 38].includes(id)) return 2;
    if ([11, 15, 19, 24, 29, 34, 39].includes(id)) return 3;
    if ([20, 25, 30, 35, 40].includes(id)) return 4;
    return 5;
  }
  // Blade/Hide (42–71) and Bludgeon/Metal (72–101) cycle T1..T5 in groups of five
  const offset = (id - (id <= 71 ? 42 : 72)) % 5;
  return offset + 1;
}

/** Item greatness from its XP (√XP, 1 to 20). */
export const itemGreatness = (xp: number): number => Math.min(20, xp <= 0 ? 1 : Math.max(1, Math.floor(Math.sqrt(xp))));

export const itemImageUrl = (id: number): string =>
  `${LOOT_SURVIVOR_URL}/images/loot/${itemName(id).replace(/ /g, "_").toLowerCase()}.png`;

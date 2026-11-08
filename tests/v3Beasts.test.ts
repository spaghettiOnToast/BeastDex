import { describe, it, expect } from "vitest";
import {
  toTokenIdString,
  toTokenIdHex,
  toTokenIdHexPadded,
  compareTokenIdStrings,
  toSafeTokenNumber,
  shortTokenId,
} from "../src/utils/tokenId";
import { matchesBeastFilters } from "../src/utils/beast";
import { beastVisual, beastRarityScore } from "../src/services/beast/helpers";
import type { Beast } from "../src/services/beast";

// A v3-sized (251-bit) token id, well past Number.MAX_SAFE_INTEGER.
const BIG = (1n << 250n) + 987654321n;
const BIG_DEC = BIG.toString();
const BIG_HEX = `0x${BIG.toString(16)}`;

describe("token id helpers (v3 251-bit ids)", () => {
  it("normalizes decimal, hex, bigint and collection:hex without precision loss", () => {
    expect(toTokenIdString(BIG_DEC)).toBe(BIG_DEC);
    expect(toTokenIdString(BIG_HEX)).toBe(BIG_DEC);
    expect(toTokenIdString(BIG)).toBe(BIG_DEC);
    expect(toTokenIdString(`beasts_nft:${BIG_HEX}`)).toBe(BIG_DEC);
    expect(toTokenIdString(42)).toBe("42");
  });

  it("rejects empty, zero, garbage and unsafe numbers", () => {
    expect(toTokenIdString("")).toBeNull();
    expect(toTokenIdString("0")).toBeNull();
    expect(toTokenIdString("abc")).toBeNull();
    expect(toTokenIdString(2 ** 60)).toBeNull();
    expect(toTokenIdString(null)).toBeNull();
  });

  it("formats hex forms", () => {
    expect(toTokenIdHex(BIG_DEC)).toBe(BIG_HEX);
    const padded = toTokenIdHexPadded("255")!;
    expect(padded).toHaveLength(66);
    expect(padded.endsWith("ff")).toBe(true);
  });

  it("compares numerically, not lexically", () => {
    expect(compareTokenIdStrings("9", "10")).toBeLessThan(0);
    expect(compareTokenIdStrings(BIG_DEC, (BIG + 1n).toString())).toBeLessThan(0);
    expect(compareTokenIdStrings(BIG_DEC, BIG_HEX)).toBe(0);
  });

  it("only yields JS numbers for legacy-sized ids", () => {
    expect(toSafeTokenNumber("85559")).toBe(85559);
    expect(toSafeTokenNumber(BIG_DEC)).toBeNull();
  });

  it("shortens long ids for display", () => {
    expect(shortTokenId("12345")).toBe("12345");
    expect(shortTokenId(BIG_DEC)).toMatch(/^\d{6}…\d{4}$/);
  });
});

describe("v3 visual presets", () => {
  it("derives shiny/animated from visualEffects, ignoring the always-true v3 animated flag", () => {
    expect(beastVisual({ shiny: false, animated: true, visualEffects: 0 })).toEqual({ shiny: false, animated: false, visual: "Regular" });
    expect(beastVisual({ shiny: true, animated: true, visualEffects: 1 })).toEqual({ shiny: true, animated: false, visual: "Shiny" });
    expect(beastVisual({ shiny: false, animated: true, visualEffects: 2 }).visual).toBe("MIDI");
    expect(beastVisual({ shiny: true, animated: true, visualEffects: 3 }).visual).toBe("Shiny MIDI");
  });

  it("falls back to legacy flags without visualEffects", () => {
    expect(beastVisual({ shiny: true, animated: false }).visual).toBe("Shiny");
  });

  it("scores rarity", () => {
    expect(beastRarityScore({ shiny: true, animated: true })).toBe(3);
    expect(beastRarityScore({ shiny: true, animated: false })).toBe(2);
    expect(beastRarityScore({})).toBe(1);
  });
});

describe("client-side v3 filter matching", () => {
  const beast: Beast = {
    id: `beasts_nft:${BIG_HEX}`,
    tokenId: BIG_DEC,
    name: "Warlock",
    image: "",
    owner: null,
    attributes: [{ trait_type: "Beast", value: "Warlock" }],
    metadata: { attributes: [] },
    power: 10,
    visual: "Shiny",
    cardGrade: 8,
    soulbound: false,
    genesis: true,
    mega: false,
    midi: true,
  };

  it("matches visual presets", () => {
    expect(matchesBeastFilters(beast, { Visual: ["Shiny", "Shiny MIDI"] })).toBe(true);
    expect(matchesBeastFilters(beast, { Visual: ["Regular"] })).toBe(false);
  });

  it("matches card grade ranges and single-value minimums", () => {
    expect(matchesBeastFilters(beast, { "Card Grade": ["7", "9"] })).toBe(true);
    expect(matchesBeastFilters(beast, { "Card Grade": ["9", "10"] })).toBe(false);
    expect(matchesBeastFilters(beast, { "Card Grade": ["8"] })).toBe(true);
    expect(matchesBeastFilters(beast, { "Card Grade": ["9"] })).toBe(false);
  });

  it("matches boolean v3 flags", () => {
    expect(matchesBeastFilters(beast, { Genesis: ["1"], MIDI: ["1"], Soulbound: ["0"], Mega: ["0"] })).toBe(true);
    expect(matchesBeastFilters(beast, { Soulbound: ["1"] })).toBe(false);
  });

  it("still matches regular attributes alongside v3 filters", () => {
    expect(matchesBeastFilters(beast, { Beast: ["Warlock"], Visual: ["Shiny"] })).toBe(true);
    expect(matchesBeastFilters(beast, { Beast: ["Lich"], Visual: ["Shiny"] })).toBe(false);
  });
});

import { describe, it, expect } from "vitest";
import {
  abstractSpecies,
  buildAbstractLeaderboards,
  isAbstractDungeon,
  parseAbstractClaim,
  parseAbstractEntry,
} from "../src/services/abstractDungeon";
import type { BeastSpecies } from "@provable-games/collectables";

describe("Abstract Dungeon events", () => {
  it("reads a BeastClaimed's recipient and species (real event, 2026-11-25)", () => {
    const e = {
      keys: [
        "0x249fa92d3ada61e8f517486e7980bedd88ae402638360361f6acbe272a39dcf",
        "0x600000000090000000001c8a5fc011a9a5b000caf21",
        "0x11aa0e10000000000000400015b80da",
        "0x38540026006e9020001c8a62b",
      ],
      data: ["0x37", "0xf", "0x70", "0x24", "0x1", "0x37", "0x13", "0x68da06331ad8ce674f76dc3531d8baef660cf09a15dac04092f07fec3cf839e"],
    };
    expect(parseAbstractClaim(e)).toEqual({
      recipient: "0x68da06331ad8ce674f76dc3531d8baef660cf09a15dac04092f07fec3cf839e",
      speciesId: 112,
    });
  });

  it("reads a DungeonEntered's player from its keys", () => {
    const e = {
      keys: ["0x24c5", "0x07ddfb44a2d54bb2fb358be8ef9bcbc45a922ddf71991bab8dd68e20cb1ffe18", "0xd8ad0bc9a3956b0110d47258a857336438e58c42"],
      data: ["0x2", "0x8", "0x6", "0x512e", "0x1"],
    };
    expect(parseAbstractEntry(e).player).toBe("0x7ddfb44a2d54bb2fb358be8ef9bcbc45a922ddf71991bab8dd68e20cb1ffe18");
  });

  it("ranks slain and daily games per player, ignoring the zero address", () => {
    const boards = buildAbstractLeaderboards({
      claims: [
        { recipient: "0xa", speciesId: 108 },
        { recipient: "0x0b", speciesId: 109 },
        { recipient: "0x0a", speciesId: 110 },
        { recipient: "0x0", speciesId: 110 },
      ],
      entries: [{ player: "0xb" }],
    });
    expect(boards.slain).toEqual([
      { address: "0xa", count: 2 },
      { address: "0xb", count: 1 },
    ]);
    expect(boards.entered).toEqual([{ address: "0xb", count: 1 }]);
  });

  it("knows its contract and species", () => {
    expect(isAbstractDungeon("0x181517a272aa72cb61f65997435b3a31083f378783fa3e3a04b6dbd741b5f50")).toBe(true);
    expect(isAbstractDungeon("0x03921001b64ad6af2bae27b95c27c465fc8921d9c537f4821eb3023b5889622f")).toBe(false);
    expect(isAbstractDungeon(null)).toBe(false);
    const species = [107, 108, 122, 123].map((speciesId) => ({ speciesId }) as BeastSpecies);
    expect(abstractSpecies(species).map((s) => s.speciesId)).toEqual([108, 122]);
  });
});

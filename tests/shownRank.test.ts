import { describe, expect, it } from "vitest";
import type { Beast as SdkBeast } from "@provable-games/collectables";
import { mapSdkBeast, shownRank } from "../src/services/beast/helpers";
import { getBeastRank, unrankedReason } from "../src/utils/beast";

// A real v3 beast from the collectables API (species 1, Warlock).
const base = {
  tokenId: "947814441540948673767761664703770484505480550200827764523431281056",
  beastId: 1, name: "Warlock", type: "Magic", tier: 1, prefix: 4, prefixName: "Beast", suffix: 11, suffixName: "Whisper",
  level: 19, health: 15, power: 95, rank: 954, adventurersKilled: 0, lastKilledBy: "0", lastDeathTimestamp: 0,
  shiny: true, animated: true, genesis: false, visualEffects: 1, soundEffects: 1, transferDamageChance: 0,
  transferLockHours: 0, transferLockedUntil: 0, soulbound: false, mintedAtBlock: 10102723, mintedAtMinute: 29659991,
  minterData: 84437, mega: false, midi: false, cardGrade: 8,
} as unknown as SdkBeast;

describe("shownRank", () => {
  it("prefers the API's projected rank", () => {
    expect(shownRank({ rank: 954, projectedRank: 956, genesis: false })).toBe(956);
    expect(shownRank({ rank: 0, projectedRank: 200, genesis: false })).toBe(200);
  });

  it("falls back to the on-chain rank without a projection", () => {
    expect(shownRank({ rank: 12, genesis: false })).toBe(12);
    expect(shownRank({ rank: 12, projectedRank: 0, genesis: false })).toBe(12);
  });

  it("keeps Genesis unranked even when the API projects one", () => {
    expect(shownRank({ rank: 0, projectedRank: 956, genesis: true })).toBe(0);
  });
});

describe("mapSdkBeast rank", () => {
  it("puts the projected rank in the Rank attribute and keeps the on-chain one", () => {
    const b = mapSdkBeast({ ...base, projectedRank: 956 });
    expect(getBeastRank(b)).toBe(956);
    expect(b.onchainRank).toBe(954);
    expect(b.rankProjected).toBe(true);
  });

  it("is not marked projected when both ranks agree", () => {
    const b = mapSdkBeast({ ...base, projectedRank: 954 });
    expect(getBeastRank(b)).toBe(954);
    expect(b.rankProjected).toBe(false);
  });

  it("gives a new mint a number instead of the New badge", () => {
    const b = mapSdkBeast({ ...base, rank: 0, minterData: 0, projectedRank: 200 });
    expect(getBeastRank(b)).toBe(200);
    expect(unrankedReason(b)).toBeNull();
  });

  it("shows Genesis as Genesis", () => {
    const b = mapSdkBeast({ ...base, rank: 0, genesis: true, projectedRank: 956 });
    expect(getBeastRank(b)).toBe(0);
    expect(b.rankProjected).toBe(false);
    expect(unrankedReason(b)).toBe("genesis");
  });
});

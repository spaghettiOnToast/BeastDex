import { describe, it, expect } from "vitest";
import type { Beast as SdkBeast } from "@provable-games/collectables";
import { tallyLootBeasts } from "../src/services/lootBeastStats";
import { LOOT_DUNGEON_ADDRESS } from "../src/services/lootDungeon";

const A = "0xa1";
const B = "0xb2";

// Species 94 is a Loot species: rainbow presets 2/3, notes presets 1/3.
const beast = (o: Partial<SdkBeast>): SdkBeast =>
  ({ tokenId: "1", beastId: 94, name: "Wulver", power: 100, owner: A, visualEffects: 0, soundEffects: 0, cardGrade: 5, mega: false, prefixName: "Death", suffixName: "Moon", ...o }) as SdkBeast;

describe("tallyLootBeasts", () => {
  it("leaves out Genesis; counts presets with the Loot masks, stakers as holders, and the strongest beast", () => {
    const s = tallyLootBeasts(
      [
        beast({ tokenId: "1", owner: A }),
        beast({ tokenId: "2", owner: LOOT_DUNGEON_ADDRESS, visualEffects: 1, power: 300 }), // MIDI on Loot
        beast({ tokenId: "3", owner: LOOT_DUNGEON_ADDRESS, visualEffects: 3, cardGrade: 10, soundEffects: 4, prefixName: "Doom", suffixName: "Instrument" }),
        beast({ tokenId: "4", owner: B, visualEffects: 2, mega: true, cardGrade: 10 }), // Shiny (Mega art) on Loot
        beast({ tokenId: "5", owner: "0xc3", visualEffects: 3, cardGrade: 10, power: 999, genesis: true }), // left out
      ],
      // token 3's stake unknown: the Loot Dungeon counts as its holder
      [
        { tokenId: "2", staker: B, stakedAt: 0, transformsAt: 900, unsafeStake: false },
        { tokenId: "9", staker: A, stakedAt: 0, transformsAt: 2000, unsafeStake: false },
      ],
      1000,
    );
    expect(s.total).toBe(4);
    expect(s.genesis).toBe(1);
    expect(s.visuals).toEqual({ Regular: 1, Shiny: 1, MIDI: 1, "Shiny MIDI": 1 });
    expect(s.staked).toBe(2);
    expect(s.megaReady).toBe(1);
    expect(s.nextMegaAt).toBe(2000);
    expect(s.holders).toBe(3); // A, B, Loot Dungeon
    expect(s.grade10).toBe(2);
    expect(s.topName).toEqual({ label: "Death Moon", count: 3 });
    expect(s.topPrefix).toEqual({ label: "Death", count: 3 });
    expect(s.strongest?.tokenId).toBe("2");
    expect(s.strongest?.owner).toBe(B);
    expect(s.strongestStaked).toBe(true);
  });
});

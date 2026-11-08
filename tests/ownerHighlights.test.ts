import { describe, it, expect, vi, beforeEach } from "vitest";

type Owned = {
  tokenId: string;
  name: string; // species
  rank: number;
  cardGrade: number;
  visualEffects: number; // 0 regular, 1 shiny, 2 animated, 3 shiny animated
  power: number;
  lastDeathTimestamp: number;
  animated: boolean; // always true on v3 — must not be used for the visual
};
const store = vi.hoisted(() => ({
  owned: [] as Owned[],
  queries: [] as unknown[],
  collected: [] as Array<{ name: string; collected: number }>,
}));

vi.mock("../src/services/beast/collectablesClient", () => ({
  collectablesClient: {
    beasts: {
      byOwner: async (_addr: string, q: unknown) => {
        store.queries.push(q);
        return { items: store.owned, total: store.owned.length };
      },
    },
  },
}));
vi.mock("../src/services/beast/highlights", () => ({
  fetchBeastHighlights: vi.fn(),
  fetchBeastCollectedByName: async () => store.collected,
}));
vi.mock("../src/services/beast/helpers", async (orig) => ({
  ...(await orig<typeof import("../src/services/beast/helpers")>()),
  mapSdkBeast: (item: Owned) => ({ name: item.tokenId }),
}));

import { compareOwnedRarity, fetchOwnerBeastHighlights } from "../src/services/beast";
import { apiCache } from "../src/services/apiCache";

const beast = (o: Partial<Owned> & { tokenId: string }): Owned => ({
  name: "Ogre",
  rank: 0,
  cardGrade: 5,
  visualEffects: 0,
  power: 100,
  lastDeathTimestamp: 0,
  animated: true,
  ...o,
});

describe("compareOwnedRarity", () => {
  const counts = new Map([
    ["Leviathan", 1009],
    ["Sprite", 1235],
  ]);
  const rarer = (a: Parameters<typeof compareOwnedRarity>[0], b: Parameters<typeof compareOwnedRarity>[0]) =>
    compareOwnedRarity(a, b, counts) < 0;

  it("Shiny MIDI beats any grade or rank of another visual", () => {
    expect(rarer({ shiny: true, animated: true, cardGrade: 1 }, { shiny: true, cardGrade: 10, rank: 1 })).toBe(true);
    expect(rarer({ shiny: true, cardGrade: 1 }, { animated: true, cardGrade: 10 })).toBe(true);
    expect(rarer({ animated: true, cardGrade: 1 }, { cardGrade: 10 })).toBe(true);
  });
  it("then the higher grade, then the least collected species, then rank", () => {
    const sm = { shiny: true, animated: true };
    expect(rarer({ ...sm, cardGrade: 10, name: "Sprite" }, { ...sm, cardGrade: 9, name: "Leviathan", rank: 1 })).toBe(true);
    expect(rarer({ ...sm, cardGrade: 10, name: "Leviathan", rank: 900 }, { ...sm, cardGrade: 10, name: "Sprite", rank: 1 })).toBe(true);
    expect(rarer({ ...sm, cardGrade: 10, name: "Sprite", rank: 3 }, { ...sm, cardGrade: 10, name: "Sprite", rank: 0 })).toBe(true);
  });
});

describe("fetchOwnerBeastHighlights", () => {
  beforeEach(() => {
    store.queries = [];
    apiCache.clearAll();
  });

  it("rarest is Shiny MIDI, then grade 10, then the least collected species; one owner query", async () => {
    store.collected = [
      { name: "Sprite", collected: 1235 },
      { name: "Leviathan", collected: 1009 },
      { name: "Qilin", collected: 950 },
    ];
    store.owned = [
      beast({ tokenId: "qilin-g9-sm-rank1", name: "Qilin", rank: 1, cardGrade: 9, visualEffects: 3 }),
      beast({ tokenId: "sprite-g10-sm", name: "Sprite", rank: 2, cardGrade: 10, visualEffects: 3 }),
      beast({ tokenId: "leviathan-g10-sm", name: "Leviathan", rank: 700, cardGrade: 10, visualEffects: 3 }),
      beast({ tokenId: "titan-g10-shiny-rank1", name: "Titan", rank: 1, cardGrade: 10, visualEffects: 1, power: 999 }),
    ];
    const h = await fetchOwnerBeastHighlights("0x1");
    expect(h.rarest?.name).toBe("leviathan-g10-sm");
    expect(h.rarestSpeciesCollected).toBe(1009);
    expect(store.queries).toHaveLength(1);
  });

  it("highest rank is the lowest rank >= 1 (rank 1 best), ties by power", async () => {
    store.owned = [
      beast({ tokenId: "unranked", rank: 0, power: 999 }),
      beast({ tokenId: "r5-weak", rank: 5, power: 10 }),
      beast({ tokenId: "r5-strong", rank: 5, power: 20 }),
      beast({ tokenId: "r9", rank: 9 }),
    ];
    const h = await fetchOwnerBeastHighlights("0x2");
    expect(h.highestRanked?.name).toBe("r5-strong");
  });

  it("no ranked beasts -> no highest rank; last collected is the most recent", async () => {
    store.owned = [
      beast({ tokenId: "old", lastDeathTimestamp: 100 }),
      beast({ tokenId: "new", lastDeathTimestamp: 200 }),
    ];
    const h = await fetchOwnerBeastHighlights("0x3");
    expect(h.highestRanked).toBeNull();
    expect(h.lastCollected?.name).toBe("new");
  });
});

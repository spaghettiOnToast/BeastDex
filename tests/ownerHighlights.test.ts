import { describe, it, expect, vi, beforeEach } from "vitest";

type Owned = {
  tokenId: string;
  rank: number;
  cardGrade: number;
  visualEffects: number; // 0 regular, 1 shiny, 2 animated, 3 shiny animated
  power: number;
  lastDeathTimestamp: number;
  animated: boolean; // always true on v3 — must not be used for the visual
};
const store = vi.hoisted(() => ({ owned: [] as Owned[], queries: [] as unknown[] }));

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
vi.mock("../src/services/beast/helpers", async (orig) => ({
  ...(await orig<typeof import("../src/services/beast/helpers")>()),
  mapSdkBeast: (item: Owned) => ({ name: item.tokenId }),
}));

import { fetchOwnerBeastHighlights, ownedBeastRarityScore } from "../src/services/beast";
import { apiCache } from "../src/services/apiCache";

const beast = (o: Partial<Owned> & { tokenId: string }): Owned => ({
  rank: 0,
  cardGrade: 5,
  visualEffects: 0,
  power: 100,
  lastDeathTimestamp: 0,
  animated: true,
  ...o,
});

describe("ownedBeastRarityScore", () => {
  it("scores rank 1 + grade 10 + shiny animated as the maximum (3)", () => {
    expect(ownedBeastRarityScore({ rank: 1, cardGrade: 10, shiny: true, animated: true })).toBeCloseTo(3);
  });
  it("treats rank 0 as unranked (no rank credit)", () => {
    expect(ownedBeastRarityScore({ rank: 0, cardGrade: 1 })).toBe(0);
  });
  it("orders visuals: animated shiny > shiny > animated > standard", () => {
    const v = (shiny: boolean, animated: boolean) => ownedBeastRarityScore({ rank: 0, cardGrade: 1, shiny, animated });
    expect(v(true, true)).toBeGreaterThan(v(true, false));
    expect(v(true, false)).toBeGreaterThan(v(false, true));
    expect(v(false, true)).toBeGreaterThan(v(false, false));
  });
});

describe("fetchOwnerBeastHighlights", () => {
  beforeEach(() => {
    store.queries = [];
    apiCache.clearAll();
  });

  it("rarest combines rank, grade and visual; one owner query for everything", async () => {
    store.owned = [
      beast({ tokenId: "grade10-regular-unranked", cardGrade: 10, power: 900 }),
      beast({ tokenId: "rank1-grade9-shinyAnimated", rank: 1, cardGrade: 9, visualEffects: 3, power: 50 }),
      beast({ tokenId: "rank2-grade9-shiny", rank: 2, cardGrade: 9, visualEffects: 1 }),
    ];
    const h = await fetchOwnerBeastHighlights("0x1");
    expect(h.rarest?.name).toBe("rank1-grade9-shinyAnimated");
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

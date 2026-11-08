import { describe, it, expect, vi, beforeEach } from "vitest";

type Query = { cardGrade?: number; rankGte?: number; sort?: string };
const calls = vi.hoisted(() => ({ queries: [] as Query[], owned: [] as Array<{ grade: number; power: number; id: string }> }));

vi.mock("../src/services/beast/collectablesClient", () => ({
  collectablesClient: {
    beasts: {
      byOwner: async (_addr: string, q: Query) => {
        calls.queries.push(q);
        const items =
          q.cardGrade != null
            ? calls.owned.filter((b) => b.grade === q.cardGrade).sort((a, b) => b.power - a.power).slice(0, 1)
            : [];
        return { items: items.map((b) => ({ id: b.id })), total: items.length };
      },
    },
  },
}));
vi.mock("../src/services/beast/helpers", async (orig) => ({
  ...(await orig<typeof import("../src/services/beast/helpers")>()),
  mapSdkBeast: (item: { id: string }) => ({ name: item.id }),
}));

import { fetchOwnerBeastHighlights } from "../src/services/beast";
import { apiCache } from "../src/services/apiCache";

describe("owner highlights: rarest", () => {
  beforeEach(() => {
    calls.queries = [];
    apiCache.clearAll();
  });

  it("picks the highest card grade, then the highest power within it", async () => {
    calls.owned = [
      { id: "g8-low", grade: 8, power: 100 },
      { id: "g8-high", grade: 8, power: 300 },
      { id: "g6-huge", grade: 6, power: 900 },
    ];
    const h = await fetchOwnerBeastHighlights("0x123");
    expect(h.rarest?.name).toBe("g8-high");
    // stopped after the first batch with a hit (10, 9, 8)
    const grades = calls.queries.filter((q) => q.cardGrade != null).map((q) => q.cardGrade);
    expect(grades).toEqual([10, 9, 8]);
  });

  it("falls through to lower grade batches", async () => {
    calls.owned = [{ id: "g4", grade: 4, power: 50 }];
    const h = await fetchOwnerBeastHighlights("0x456");
    expect(h.rarest?.name).toBe("g4");
  });

  it("asks for ranked beasts only (rank 0 = unranked)", async () => {
    calls.owned = [];
    await fetchOwnerBeastHighlights("0x789");
    expect(calls.queries.find((q) => q.sort === "rank")?.rankGte).toBe(1);
  });
});

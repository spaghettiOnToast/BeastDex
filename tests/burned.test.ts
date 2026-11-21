import { describe, it, expect } from "vitest";
import { adjustGroups, adjustList, adjustStats, countBurned, groupKey, matchesQuery } from "../src/services/beast/burned";

type Any = Parameters<typeof matchesQuery>[0];
const tok = (over: Record<string, unknown>): Any =>
  ({
    tokenId: "1",
    beastId: 80,
    name: "Dybbuk",
    type: "Magic",
    tier: 1,
    prefixName: "Horror",
    suffixName: "Growl",
    level: 61,
    power: 305,
    shiny: false,
    midi: false,
    animated: true,
    genesis: false,
    visualEffects: 0,
    cardGrade: 9,
    owner: null,
    ...over,
  }) as unknown as Any;

const burned = [tok({ tokenId: "b1" }), tok({ tokenId: "b2", beastId: 90, tier: 3, visualEffects: 1, midi: true, prefixName: null, suffixName: null })];
const ids = new Set(burned.map((b) => b.tokenId));

describe("matchesQuery", () => {
  it("judges eq / range / in / boolean filters", () => {
    const b = burned[0];
    expect(matchesQuery(b, { beastIdGte: 78, beastIdLte: 107 })).toBe(true);
    expect(matchesQuery(b, { beastIdGte: 1, beastIdLte: 77 })).toBe(false);
    expect(matchesQuery(b, { visualEffectsIn: [0, 2] })).toBe(true);
    expect(matchesQuery(b, { prefixName: "horror" })).toBe(true);
    expect(matchesQuery(b, { genesis: false, cardGrade: 9 })).toBe(true);
    expect(matchesQuery(b, { midi: true })).toBe(false);
    expect(matchesQuery(b, { search: "growl" })).toBe(true);
    expect(matchesQuery(b, { sort: "power", limit: 1 })).toBe(true);
  });

  it("never matches an owner query, and can't judge an unknown field", () => {
    expect(matchesQuery(burned[0], { owner: "0x1" })).toBe(false);
    expect(matchesQuery(burned[0], { airdropRound: 1 } as never)).toBeNull();
    expect(countBurned(burned, { airdropRound: 1 } as never)).toBeNull();
  });
});

describe("adjustList", () => {
  const page = { items: [tok({ tokenId: "live", owner: "0xa" }), burned[0]], total: 10, nextCursor: null };

  it("drops burned items and takes every matching burned token off the total", () => {
    const r = adjustList(page, { beastIdGte: 78 }, burned, ids);
    expect(r.items.map((b) => b.tokenId)).toEqual(["live"]);
    expect(r.total).toBe(8);
    expect(adjustList(page, { tier: 3 }, burned, ids).total).toBe(9);
  });

  it("leaves token-id lookups alone", () => {
    expect(adjustList(page, { tokenIdIn: ["b1"] }, burned, ids)).toBe(page);
  });
});

describe("adjustGroups", () => {
  it("subtracts per group, drops emptied groups and re-sorts", () => {
    const page = {
      items: [
        { key: "__none__", label: "__none__", count: 3, shinyCount: 0, midiCount: 2, animatedCount: 3 },
        { key: '"Mind Shadow"', label: '"Mind Shadow"', count: 3, shinyCount: 0, midiCount: 0, animatedCount: 3 },
        { key: '"Horror Growl"', label: '"Horror Growl"', count: 1, shinyCount: 0, midiCount: 0, animatedCount: 1 },
      ],
      total: 3,
    } as never;
    const r = adjustGroups(page, { groupBy: "full_name" } as never, burned) as unknown as { items: Array<Record<string, unknown>>; total: number };
    expect(r.items.map((g) => [g.key, g.count])).toEqual([
      ['"Mind Shadow"', 3],
      ["__none__", 2],
    ]);
    expect(r.items[1].midiCount).toBe(1);
    expect(r.total).toBe(2);
    expect(groupKey(burned[1], "beast_id")).toBe("90");
  });
});

describe("adjustStats", () => {
  it("uses owned tokens as the total and subtracts burned visuals", () => {
    const r = adjustStats({ holders: 5, ownedTokens: 98, totalTokens: 100, shiny: 10, midi: 10, animated: 100, genesis: 7 } as never, burned) as unknown as Record<string, number>;
    expect(r).toMatchObject({ totalTokens: 98, shiny: 10, midi: 9, animated: 98, genesis: 7, holders: 5 });
  });
});

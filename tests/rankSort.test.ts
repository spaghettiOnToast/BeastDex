import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Beast } from "../src/services/beast";

// ── API-side rank sort (fetchBeasts) ─────────────────────────────────────────
type Item = { tokenId: string; rank: number; power: number };
const api = vi.hoisted(() => ({ all: [] as Item[], calls: [] as Record<string, unknown>[] }));

vi.mock("../src/services/beast/collectablesClient", () => ({
  collectablesClient: {
    beasts: {
      list: async (q: Record<string, unknown>) => {
        api.calls.push(q);
        let rows = api.all.slice();
        if (q.rank === 0) rows = rows.filter((b) => b.rank === 0);
        if (typeof q.rankGte === "number") rows = rows.filter((b) => b.rank >= (q.rankGte as number));
        if (q.sort === "rank") rows.sort((a, b) => (q.order === "desc" ? b.rank - a.rank : a.rank - b.rank));
        if (q.sort === "power") rows.sort((a, b) => b.power - a.power);
        const limit = (q.limit as number) ?? 50;
        const offset = q.cursor ? Number(q.cursor) : 0;
        const items = rows.slice(offset, offset + limit);
        const next = offset + limit < rows.length ? String(offset + limit) : null;
        return { items, total: rows.length, nextCursor: next };
      },
    },
  },
}));
vi.mock("../src/services/beast/helpers", async (orig) => ({
  ...(await orig<typeof import("../src/services/beast/helpers")>()),
  mapSdkBeast: (item: Item) => ({ tokenId: item.tokenId, name: item.tokenId }),
}));

import { fetchBeasts } from "../src/services/beast";
import { apiCache } from "../src/services/apiCache";
import { sortBeasts } from "../src/utils/sort";

const ids = (r: { beasts: Array<{ tokenId: string }> }) => r.beasts.map((b) => b.tokenId);

describe("fetchBeasts rank sort", () => {
  beforeEach(() => {
    api.calls = [];
    apiCache.clearAll();
    api.all = [
      { tokenId: "r3", rank: 3, power: 10 },
      { tokenId: "u-weak", rank: 0, power: 5 },
      { tokenId: "r1", rank: 1, power: 30 },
      { tokenId: "u-strong", rank: 0, power: 200 },
      { tokenId: "r2", rank: 2, power: 20 },
    ];
  });

  it("puts unranked beasts after ranked ones (ascending), strongest unranked first", async () => {
    const r = await fetchBeasts({ sort: "rank", limit: 10 });
    expect(ids(r)).toEqual(["r1", "r2", "r3", "u-strong", "u-weak"]);
    expect(r.total).toBe(5);
  });

  it("keeps unranked last when descending", async () => {
    const r = await fetchBeasts({ sort: "rank-desc", limit: 10 });
    expect(ids(r)).toEqual(["r3", "r2", "r1", "u-strong", "u-weak"]);
  });

  it("pages across the ranked/unranked boundary", async () => {
    const p1 = await fetchBeasts({ sort: "rank", limit: 2, page: 1 });
    const p2 = await fetchBeasts({ sort: "rank", limit: 2, page: 2 });
    const p3 = await fetchBeasts({ sort: "rank", limit: 2, page: 3 });
    expect([ids(p1), ids(p2), ids(p3)]).toEqual([["r1", "r2"], ["r3", "u-strong"], ["u-weak"]]);
  });
});

// ── Client-side rank sort (sortBeasts) ───────────────────────────────────────
const beast = (tokenId: string, rank: number): Beast =>
  ({ tokenId, name: tokenId, power: 1, attributes: [{ trait_type: "Rank", value: String(rank) }] }) as unknown as Beast;

describe("sortBeasts rank", () => {
  const list = [beast("1", 0), beast("2", 5), beast("3", 1), beast("4", 0), beast("5", 900)];

  it("ascending: rank 1 first, unranked last", () => {
    expect(sortBeasts(list, "rank-asc").map((b) => b.tokenId)).toEqual(["3", "2", "5", "1", "4"]);
  });

  it("descending: highest number first, unranked still last", () => {
    expect(sortBeasts(list, "rank-desc").map((b) => b.tokenId)).toEqual(["5", "2", "3", "1", "4"]);
  });
});

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Beast } from "../src/services/beast";

// ── API-side rank sort (fetchBeasts) ─────────────────────────────────────────
type Item = { tokenId: string; rank: number; projectedRank: number; genesis?: boolean; power: number };
const api = vi.hoisted(() => ({ all: [] as Item[], calls: [] as Record<string, unknown>[] }));

vi.mock("../src/services/beast/collectablesClient", () => ({
  collectablesClient: {
    beasts: {
      list: async (q: Record<string, unknown>) => {
        api.calls.push(q);
        let rows = api.all.slice();
        if (typeof q.projectedRankGte === "number") rows = rows.filter((b) => b.projectedRank >= (q.projectedRankGte as number));
        if (typeof q.projectedRankLte === "number") rows = rows.filter((b) => b.projectedRank <= (q.projectedRankLte as number));
        if (q.genesis === false) rows = rows.filter((b) => !b.genesis);
        if (q.sort === "projected_rank")
          rows.sort((a, b) => (q.order === "desc" ? b.projectedRank - a.projectedRank : a.projectedRank - b.projectedRank));
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

describe("fetchBeasts rank sort and filter (API projected rank)", () => {
  beforeEach(() => {
    api.calls = [];
    apiCache.clearAll();
    api.all = [
      { tokenId: "p3-onchain2", rank: 2, projectedRank: 3, power: 10 },
      { tokenId: "new-p2", rank: 0, projectedRank: 2, power: 20 },
      { tokenId: "p1", rank: 1, projectedRank: 1, power: 30 },
      { tokenId: "genesis", rank: 0, projectedRank: 4, genesis: true, power: 1 },
    ];
  });

  it("sorts by projected rank, so new mints sit in rank order", async () => {
    const r = await fetchBeasts({ sort: "rank", limit: 10 });
    expect(api.calls[0]).toMatchObject({ sort: "projected_rank", order: "asc" });
    expect(ids(r).slice(0, 3)).toEqual(["p1", "new-p2", "p3-onchain2"]);
  });

  it("sorts descending by projected rank", async () => {
    await fetchBeasts({ sort: "rank-desc", limit: 10 });
    expect(api.calls[0]).toMatchObject({ sort: "projected_rank", order: "desc" });
  });

  it("filters a rank range on projected rank and leaves Genesis out", async () => {
    const r = await fetchBeasts({ attributeFilters: { Rank: [1, 10] }, limit: 10 });
    expect(api.calls[0]).toMatchObject({ projectedRankGte: 1, projectedRankLte: 10, genesis: false });
    expect(ids(r).sort()).toEqual(["new-p2", "p1", "p3-onchain2"]);
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

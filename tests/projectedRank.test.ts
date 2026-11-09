import { describe, expect, it } from "vitest";
import { buildProjectionTable, projectRank, type NewBeastEntry } from "../src/services/beast/projectedRank";

type B = { tokenId: string; beastId: number; level: number; health: number; mintedAtBlock: number; genesis: boolean };

/** The on-chain order: level desc, health desc, earlier mint first. */
const onchainOrder = (a: B, b: B) => b.level - a.level || b.health - a.health || a.mintedAtBlock - b.mintedAtBlock;

/** Small seeded PRNG so failures reproduce. */
function rng(seed: number) {
  return () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
}

function species(beastId: number, ranked: number, fresh: number, seed: number) {
  const r = rng(seed);
  // Narrow level/health ranges force plenty of ties.
  const make = (i: number, block: number): B => ({
    tokenId: String(beastId * 100000 + i),
    beastId,
    level: 1 + Math.floor(r() * 8),
    health: 1 + Math.floor(r() * 6),
    mintedAtBlock: block,
    genesis: false,
  });
  const old = Array.from({ length: ranked }, (_, i) => make(i, 1000 + i));
  const news = Array.from({ length: fresh }, (_, i) => make(ranked + i, 5000 + i));
  const oldRank = new Map([...old].sort(onchainOrder).map((b, i) => [b.tokenId, i + 1]));
  const trueRank = new Map([...old, ...news].sort(onchainOrder).map((b, i) => [b.tokenId, i + 1]));
  // What the loader computes: ranked beasts at least as strong (level, then health).
  const entries: NewBeastEntry[] = news.map((n) => ({
    ...n,
    mintedAtMinute: 0,
    rankedAbove: old.filter((o) => o.level > n.level || (o.level === n.level && o.health >= n.health)).length,
  }));
  return { old, news, oldRank, trueRank, entries };
}

describe("projectRank", () => {
  it("matches a full re-rank for every beast, across species and seeds", () => {
    for (let seed = 1; seed <= 20; seed++) {
      const a = species(1, 60, 7, seed);
      const b = species(2, 40, 3, seed + 100);
      const table = buildProjectionTable([...a.entries, ...b.entries]);
      for (const s of [a, b]) {
        for (const o of s.old) expect(projectRank(table, { ...o, rank: s.oldRank.get(o.tokenId)! })).toBe(s.trueRank.get(o.tokenId));
        for (const n of s.news) expect(projectRank(table, { ...n, rank: 0 })).toBe(s.trueRank.get(n.tokenId));
      }
    }
  });

  it("gives every beast of a species a distinct rank 1..N", () => {
    const s = species(3, 50, 10, 42);
    const table = buildProjectionTable(s.entries);
    const ranks = [
      ...s.old.map((o) => projectRank(table, { ...o, rank: s.oldRank.get(o.tokenId)! })),
      ...s.news.map((n) => projectRank(table, { ...n, rank: 0 })),
    ].sort((x, y) => x! - y!);
    expect(ranks).toEqual(Array.from({ length: 60 }, (_, i) => i + 1));
  });

  it("leaves ranks unchanged in species without new beasts", () => {
    const table = buildProjectionTable([]);
    expect(projectRank(table, { tokenId: "1", beastId: 9, level: 5, health: 5, rank: 17, genesis: false })).toBe(17);
  });

  it("gives Genesis and unknown rank-0 beasts no rank", () => {
    const table = buildProjectionTable([]);
    expect(projectRank(table, { tokenId: "1", beastId: 9, level: 1, health: 100, rank: 0, genesis: true })).toBeNull();
    expect(projectRank(table, { tokenId: "2", beastId: 9, level: 9, health: 9, rank: 0, genesis: false })).toBeNull();
  });
});

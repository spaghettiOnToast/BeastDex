import { describe, expect, it } from "vitest";
import type { Beast } from "../src/services/beast";
import { matchesRankFilter, matchesTierFilter, rankFilterLabel, rankOf } from "../src/utils/tierRankFilter";

const beast = (tier: number, rank: number): Beast =>
  ({
    id: `b-${tier}-${rank}`,
    tokenId: "1",
    name: "Test",
    image: "",
    owner: null,
    metadata: {},
    power: null,
    attributes: [
      { trait_type: "Tier", value: tier },
      { trait_type: "Rank", value: rank },
    ],
  }) as Beast;

describe("tier / rank filters", () => {
  it("matches tiers", () => {
    expect(matchesTierFilter(beast(2, 5), "all")).toBe(true);
    expect(matchesTierFilter(beast(2, 5), 2)).toBe(true);
    expect(matchesTierFilter(beast(2, 5), 3)).toBe(false);
  });

  it("treats rank 0 as unranked", () => {
    expect(rankOf(beast(1, 0))).toBeNull();
    expect(matchesRankFilter(beast(1, 0), "top10")).toBe(false);
    expect(matchesRankFilter(beast(1, 0), "all")).toBe(true);
  });

  it("matches top 10 and single ranks", () => {
    expect(matchesRankFilter(beast(1, 10), "top10")).toBe(true);
    expect(matchesRankFilter(beast(1, 11), "top10")).toBe(false);
    expect(matchesRankFilter(beast(1, 1), 1)).toBe(true);
    expect(matchesRankFilter(beast(1, 2), 1)).toBe(false);
    expect(rankFilterLabel(1)).toBe("Rank 1 (King)");
  });
});

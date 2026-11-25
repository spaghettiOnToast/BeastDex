import { describe, expect, it } from "vitest";
import { matchesSpeciesSet, speciesSetOf } from "../src/utils/speciesSet";

describe("speciesSet", () => {
  it("splits originals, festival and Loot species", () => {
    expect(speciesSetOf(1)).toBe("original");
    expect(speciesSetOf(75)).toBe("original");
    expect(speciesSetOf(76)).toBe("festival");
    expect(speciesSetOf(77)).toBe("festival");
    expect(speciesSetOf(78)).toBe("loot");
    expect(speciesSetOf(107)).toBe("loot");
    expect(speciesSetOf(108)).toBe("abstract");
    expect(speciesSetOf(122)).toBe("abstract");
    expect(speciesSetOf(123)).toBe("festival");
  });

  it("filters, passing unknown species only for all", () => {
    expect(matchesSpeciesSet(80, "loot")).toBe(true);
    expect(matchesSpeciesSet(80, "original")).toBe(false);
    expect(matchesSpeciesSet(undefined, "loot")).toBe(false);
    expect(matchesSpeciesSet(undefined, "all")).toBe(true);
    expect(matchesSpeciesSet(115, "abstract")).toBe(true);
    expect(matchesSpeciesSet(115, "original")).toBe(false);
    expect(matchesSpeciesSet(115, "loot")).toBe(false);
  });
});

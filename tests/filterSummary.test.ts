import { describe, expect, it } from "vitest";
import { describeAttributeFilters } from "../src/utils/filterSummary";

describe("describeAttributeFilters", () => {
  it("labels visuals, grades, booleans, tiers and search", () => {
    expect(
      describeAttributeFilters(
        { Visual: ["Shiny MIDI"], "Card Grade": ["10", "10"], Genesis: ["0"], MIDI: ["1"], Tier: ["1"] },
        "  dragon "
      )
    ).toEqual(["“dragon”", "Shiny MIDI", "Grade 10", "Genesis: No", "MIDI", "Tier 1"]);
  });
  it("ranges and many values", () => {
    expect(describeAttributeFilters({ "Card Grade": ["8", "10"], Beast: ["Ogre", "Troll", "Titan"], Level: ["10", "20"] })).toEqual([
      "Grade 8–10",
      "3 beasts",
      "Level 10–20",
    ]);
  });
  it("skips empty filters", () => {
    expect(describeAttributeFilters({ Visual: [], Tier: [""] }, "")).toEqual([]);
  });
});

import { describe, it, expect } from "vitest";
import { beastConditionRows, formatCentering } from "../src/services/beast/condition";

// Real v3 tokens from the collectables API (grade 7 and grade 10).
const GRADE_7 = "947819263557514267912889930803457441577027375186918101925526716893";
const GRADE_10 = "947810826190769320837858821737753470652770173935338384837652250624";

const asMap = (rows: { label: string; value: string }[] | null) =>
  Object.fromEntries((rows ?? []).map((r) => [r.label, r.value]));

describe("v3 print condition", () => {
  it("formats centering as a grading split", () => {
    expect(formatCentering(10000)).toBe("50/50");
    expect(formatCentering(9000)).toBe("55/45");
    expect(formatCentering(9523)).toBe("52.385/47.615");
  });

  it("decodes a flawed card (grade 7)", () => {
    const c = asMap(beastConditionRows(GRADE_7));
    expect(c["Horizontal Centering"]).toBe("52.385/47.615");
    expect(c["Horizontal Shift"]).toBe("Right");
    expect(c["Vertical Shift"]).toBe("Down");
    expect(c["Roller Marks"]).toBe("Moderate");
    expect(c["Roller Location"]).toBe("Outside Art");
    expect(c["Hickeys"]).toBe("0");
    expect(c["Hickey Location"]).toBe("None");
  });

  it("decodes a perfect card (grade 10)", () => {
    const rows = beastConditionRows(GRADE_10)!;
    expect(rows).toHaveLength(12);
    const c = asMap(rows);
    expect(c["Horizontal Centering"]).toBe("50/50");
    expect(c["Horizontal Shift"]).toBe("Centered");
    expect(c["Corner Chips"]).toBe("None");
  });

  it("returns null for missing or invalid ids", () => {
    expect(beastConditionRows("")).toBeNull();
    expect(beastConditionRows(undefined)).toBeNull();
    expect(beastConditionRows("not-a-number")).toBeNull();
  });
});

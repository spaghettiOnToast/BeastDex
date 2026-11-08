import { describe, expect, it } from "vitest";
import { countByGrade, gradeFilterLabel, matchesGradeFilter } from "../src/utils/gradeFilter";

const beasts = [{ cardGrade: 10 }, { cardGrade: 10 }, { cardGrade: 0 }, { cardGrade: 7 }, {}];

describe("grade filter", () => {
  it("matches a grade, ungraded, or everything", () => {
    expect(beasts.filter((b) => matchesGradeFilter(b, 10))).toHaveLength(2);
    expect(beasts.filter((b) => matchesGradeFilter(b, 0))).toHaveLength(1); // 0 is a grade, not "none"
    expect(beasts.filter((b) => matchesGradeFilter(b, "none"))).toHaveLength(1);
    expect(beasts.filter((b) => matchesGradeFilter(b, "all"))).toHaveLength(5);
  });
  it("counts per grade", () => {
    const c = countByGrade(beasts);
    expect(c.get(10)).toBe(2);
    expect(c.get(0)).toBe(1);
    expect(c.get("none")).toBe(1);
    expect(c.get(5)).toBeUndefined();
  });
  it("labels", () => {
    expect(gradeFilterLabel("all")).toBe("All");
    expect(gradeFilterLabel(9)).toBe("Grade 9");
    expect(gradeFilterLabel("none")).toBe("No grade");
  });
});

import { gradeBuckets } from "../src/utils/gradeFilter";

describe("gradeBuckets", () => {
  it("counts 10, 9, 8 and 7-or-lower, skipping ungraded", () => {
    const list = [10, 10, 9, 8, 8, 8, 7, 3, 0].map((g) => ({ cardGrade: g }));
    expect(gradeBuckets([...list, {}])).toEqual({ g10: 2, g9: 1, g8: 3, g7AndBelow: 3 });
  });
});

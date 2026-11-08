import type { Beast } from "../services/beast";

/** Card grades, best first. */
export const GRADES = [10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0];

/** "all", a card grade 0-10, or "none" for beasts without a grade (legacy). */
export type GradeFilter = "all" | "none" | number;

export function gradeOf(beast: Pick<Beast, "cardGrade">): number | null {
  return typeof beast.cardGrade === "number" ? beast.cardGrade : null;
}

export function matchesGradeFilter(beast: Pick<Beast, "cardGrade">, filter: GradeFilter): boolean {
  if (filter === "all") return true;
  const grade = gradeOf(beast);
  return filter === "none" ? grade === null : grade === filter;
}

/** Count of beasts per grade ("none" for ungraded). */
export function countByGrade(beasts: Array<Pick<Beast, "cardGrade">>): Map<number | "none", number> {
  const counts = new Map<number | "none", number>();
  for (const b of beasts) {
    const key = gradeOf(b) ?? "none";
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

export function gradeFilterLabel(filter: GradeFilter): string {
  return filter === "all" ? "All" : filter === "none" ? "No grade" : `Grade ${filter}`;
}


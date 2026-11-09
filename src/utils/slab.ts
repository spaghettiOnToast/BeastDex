import type { Beast } from "../services/beast";

/** Grades from this value up are shown sealed in a graded-card slab. */
export const SLAB_MIN_GRADE = 7;

export function isSlabbed(beast: Beast, missing = false): boolean {
  return (
    !missing &&
    Boolean(beast.tokenId) &&
    beast.visualEffects !== undefined &&
    (beast.cardGrade ?? 0) >= SLAB_MIN_GRADE
  );
}

/**
 * Marketplace Utilities
 *
 * This module re-exports common utilities used by marketplace components.
 * The actual implementations are in the utils/ directory.
 */

import { FESTIVAL_FILTER_TRAIT, festivalCollectionFor } from "../../services/festivalBeasts";
import type { Listing } from "../../services/marketplace/types";
import type { BeastAttributeFilters } from "../../services/beast";
import { toBigIntSafe } from "../../utils/bigint";
import {
  getAttributeValues,
  getNumericAttribute,
  matchesBeastFilters,
} from "../../utils/beast";

// Re-export utilities for backwards compatibility
export { getAttributeValues, getNumericAttribute, matchesBeastFilters };
export { sortListings, sortBeasts, type TokenPriceMap } from "../../utils/sort";
export const toBigInt = toBigIntSafe;

/**
 * Trait types that should be hidden from filters
 */
export const HIDDEN_FILTER_TRAITS = new Set([
  "adventurerkilledcount",
  "adventurer killed count",
  "adventurers killed",
  "lastkilledby",
  "last killed by",
  "lastdeathtimestamp",
  "last death timestamp",
  "health",
  "power",
]);

/**
 * Check if a listing matches the given attribute filters
 * @param listing - The listing to check
 * @param filters - The attribute filters to match against
 * @returns True if the listing matches all filters
 */
/**
 * Whether festival tokens pass the current filters: they have no Beast traits,
 * so any Beast-only filter (or Festival = No) excludes them.
 */
export function festivalItemsMatchFilters(filters: BeastAttributeFilters): boolean {
  return Object.entries(filters || {}).every(([trait, values]) => {
    if (!Array.isArray(values) || values.length === 0) return true;
    if (trait.toLowerCase() !== FESTIVAL_FILTER_TRAIT.toLowerCase()) return false;
    return values.some((v) => v === "1" || v === "true");
  });
}

export function matchesAttributeFilters(
  listing: Listing,
  filters: BeastAttributeFilters
): boolean {
  const isFestival = Boolean(listing.festival || festivalCollectionFor(listing.collection));
  if (isFestival) return festivalItemsMatchFilters(filters);
  const otherFilters: BeastAttributeFilters = {};
  for (const [trait, values] of Object.entries(filters || {})) {
    if (!Array.isArray(values) || values.length === 0) continue;
    if (trait.toLowerCase() === FESTIVAL_FILTER_TRAIT.toLowerCase()) {
      // Festival: Yes = festival tokens only, No = Beasts only
      if (values.some((v) => v === "1" || v === "true")) return false;
    } else {
      otherFilters[trait] = values;
    }
  }
  return matchesBeastFilters(listing.beast, otherFilters);
}

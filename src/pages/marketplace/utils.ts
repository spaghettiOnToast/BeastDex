/**
 * Marketplace Utilities
 *
 * This module re-exports common utilities used by marketplace components.
 * The actual implementations are in the utils/ directory.
 */

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
export function matchesAttributeFilters(
  listing: Listing,
  filters: BeastAttributeFilters
): boolean {
  return matchesBeastFilters(listing.beast, filters);
}

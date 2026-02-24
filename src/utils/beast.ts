/**
 * Beast Attribute Utilities
 *
 * Helper functions for extracting and working with beast attributes.
 */

import type { Beast, BeastAttributeFilters } from "../services/beast";

/**
 * WeakMap cache for pre-indexed beast attributes
 * Maps Beast -> Map<trait_type (lowercase), string[]>
 */
const attributeIndexCache = new WeakMap<Beast, Map<string, string[]>>();

/**
 * Get or create an attribute index for a beast
 * This converts O(n) attribute lookups to O(1) after first access
 */
function getAttributeIndex(beast: Beast): Map<string, string[]> {
  let index = attributeIndexCache.get(beast);
  if (!index) {
    index = new Map<string, string[]>();
    for (const attr of beast.attributes ?? []) {
      const trait = attr.trait_type?.toLowerCase();
      if (trait) {
        const existing = index.get(trait);
        const value = String(attr.value ?? "");
        if (existing) {
          existing.push(value);
        } else {
          index.set(trait, [value]);
        }
      }
    }
    attributeIndexCache.set(beast, index);
  }
  return index;
}

/**
 * Get attribute values for a specific trait from a beast
 * Uses cached index for O(1) lookup after first access
 * @param beast - The beast to extract attributes from
 * @param trait - The trait type to search for (case-insensitive)
 * @returns Array of attribute values matching the trait
 */
export function getAttributeValues(
  beast: Beast | null | undefined,
  trait: string
): string[] {
  if (!beast) return [];
  const index = getAttributeIndex(beast);
  return index.get(trait.toLowerCase()) ?? [];
}

/**
 * Get a single attribute value for a specific trait from a beast
 * @param beast - The beast to extract attributes from
 * @param trait - The trait type to search for (case-insensitive)
 * @returns The first matching attribute value or undefined
 */
export function getAttributeValue(
  beast: Beast | null | undefined,
  trait: string
): string | undefined {
  const values = getAttributeValues(beast, trait);
  return values.length > 0 ? values[0] : undefined;
}

/**
 * Get numeric attribute value for a specific trait from a beast
 * @param beast - The beast to extract attributes from
 * @param trait - The trait type to search for (case-insensitive)
 * @returns The numeric value or null if not found or not numeric
 */
export function getNumericAttribute(
  beast: Beast | null | undefined,
  trait: string
): number | null {
  const values = getAttributeValues(beast, trait);
  if (values.length === 0) return null;
  const numberValue = Number(values[0]);
  return Number.isFinite(numberValue) ? numberValue : null;
}

/**
 * Check if a beast has a specific attribute value
 * @param beast - The beast to check
 * @param trait - The trait type to search for
 * @param value - The value to match (case-insensitive)
 * @returns True if the beast has the attribute with the specified value
 */
export function hasAttributeValue(
  beast: Beast | null | undefined,
  trait: string,
  value: string
): boolean {
  const values = getAttributeValues(beast, trait);
  const target = value.toLowerCase();
  return values.some((v) => v.toLowerCase() === target);
}

/**
 * Check if a beast matches the given attribute filters
 * @param beast - The beast to check
 * @param filters - The attribute filters to match against
 * @returns True if the beast matches all filters
 */
export function matchesBeastFilters(
  beast: Beast | null | undefined,
  filters: BeastAttributeFilters
): boolean {
  const entries = Object.entries(filters || {});
  if (entries.length === 0) {
    return true;
  }

  // Can't match specific filters without beast data
  if (!beast) return false;

  return entries.every(([trait, values]) => {
    if (!Array.isArray(values) || values.length === 0) {
      return true;
    }

    const beastValues = getAttributeValues(beast, trait);
    if (beastValues.length === 0) {
      return false;
    }

    return values.some((value) => beastValues.includes(String(value)));
  });
}

/**
 * Get the beast type name from a beast
 * @param beast - The beast to extract the type from
 * @returns The beast type or undefined
 */
export function getBeastType(beast: Beast | null | undefined): string | undefined {
  return getAttributeValue(beast, "Beast");
}

/**
 * Get the tier from a beast
 * @param beast - The beast to extract the tier from
 * @returns The tier number or null
 */
export function getBeastTier(beast: Beast | null | undefined): number | null {
  return getNumericAttribute(beast, "Tier");
}

/**
 * Get the health from a beast
 * @param beast - The beast to extract the health from
 * @returns The health value or null
 */
export function getBeastHealth(beast: Beast | null | undefined): number | null {
  return getNumericAttribute(beast, "Health");
}

/**
 * Get the rank from a beast
 * @param beast - The beast to extract the rank from
 * @returns The rank value or null
 */
export function getBeastRank(beast: Beast | null | undefined): number | null {
  return getNumericAttribute(beast, "Rank");
}

/**
 * Get the last death timestamp from a beast
 * @param beast - The beast to extract the timestamp from
 * @returns The timestamp or null
 */
export function getBeastLastDeathTimestamp(
  beast: Beast | null | undefined
): number | null {
  return (
    getNumericAttribute(beast, "Last Death Timestamp") ??
    getNumericAttribute(beast, "last death timestamp")
  );
}

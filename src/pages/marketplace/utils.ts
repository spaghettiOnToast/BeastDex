import type { Beast, BeastAttributeFilters } from "../../services/beast";
import type { Listing } from "../../services/marketplace/types";
import type { SortOption } from "../../components/sort/SortDropdown";
import { toBigIntSafe } from "../../utils/bigint";

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
]);

/**
 * Safe BigInt conversion utility
 */
export const toBigInt = toBigIntSafe;

/**
 * Get attribute values for a specific trait from a beast
 * @param beast - The beast to extract attributes from
 * @param trait - The trait type to search for
 * @returns Array of attribute values matching the trait
 */
export function getAttributeValues(
  beast: Beast | null | undefined,
  trait: string
): string[] {
  if (!beast) return [];
  const target = trait.toLowerCase();
  return (beast.attributes ?? [])
    .filter((attr) => attr.trait_type?.toLowerCase() === target)
    .map((attr) => String(attr.value ?? ""));
}

/**
 * Get numeric attribute value for a specific trait from a beast
 * @param beast - The beast to extract attributes from
 * @param trait - The trait type to search for
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
 * Check if a listing matches the given attribute filters
 * @param listing - The listing to check
 * @param filters - The attribute filters to match against
 * @returns True if the listing matches all filters
 */
export function matchesAttributeFilters(
  listing: Listing,
  filters: BeastAttributeFilters
): boolean {
  const entries = Object.entries(filters || {});
  if (entries.length === 0) {
    return true;
  }

  return entries.every(([trait, values]) => {
    if (!Array.isArray(values) || values.length === 0) {
      return true;
    }
    const listingValues = getAttributeValues(listing.beast ?? null, trait);
    if (listingValues.length === 0) {
      return false;
    }
    return values.some((value) => listingValues.includes(String(value)));
  });
}

/**
 * Check if a beast matches the given attribute filters
 * @param beast - The beast to check
 * @param filters - The attribute filters to match against
 * @returns True if the beast matches all filters
 */
export function matchesBeastFilters(
  beast: Beast,
  filters: BeastAttributeFilters
): boolean {
  const entries = Object.entries(filters || {});
  if (entries.length === 0) {
    return true;
  }

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
 * Sort listings based on the selected sort option
 * @param listings - Array of listings to sort
 * @param option - Sort option to apply
 * @returns Sorted array of listings
 */
export function sortListings(
  listings: Listing[],
  option: SortOption
): Listing[] {
  const copy = [...listings];

  const compareStrings = (
    a: string | null | undefined,
    b: string | null | undefined
  ) => {
    const left = (a ?? "").toLowerCase();
    const right = (b ?? "").toLowerCase();
    return left.localeCompare(right);
  };

  // Helper to get a comparable price value
  // Returns a tuple: [currency_address, price_value]
  // This allows sorting by currency first, then by price within each currency
  const getComparablePrice = (listing: Listing): { currency: string; value: bigint } => {
    try {
      const price = BigInt(listing.price);
      const currency = listing.paymentToken?.toLowerCase() || "0x0";
      return { currency, value: price };
    } catch {
      return { currency: "0x0", value: 0n };
    }
  };

  switch (option) {
    case "beast-asc":
      return copy.sort((a, b) => {
        const traitA =
          getAttributeValues(a.beast ?? null, "Beast")[0] ??
          a.beast?.name ??
          "";
        const traitB =
          getAttributeValues(b.beast ?? null, "Beast")[0] ??
          b.beast?.name ??
          "";
        return (
          compareStrings(traitA, traitB) || a.tokenId.localeCompare(b.tokenId)
        );
      });
    case "beast-desc":
      return copy.sort((a, b) => {
        const traitA =
          getAttributeValues(a.beast ?? null, "Beast")[0] ??
          a.beast?.name ??
          "";
        const traitB =
          getAttributeValues(b.beast ?? null, "Beast")[0] ??
          b.beast?.name ??
          "";
        return (
          compareStrings(traitB, traitA) || a.tokenId.localeCompare(b.tokenId)
        );
      });
    case "tier-asc":
      return copy.sort((a, b) => {
        const tierA =
          getNumericAttribute(a.beast ?? null, "Tier") ??
          Number.POSITIVE_INFINITY;
        const tierB =
          getNumericAttribute(b.beast ?? null, "Tier") ??
          Number.POSITIVE_INFINITY;
        return tierA - tierB || a.tokenId.localeCompare(b.tokenId);
      });
    case "tier-desc":
      return copy.sort((a, b) => {
        const tierA =
          getNumericAttribute(a.beast ?? null, "Tier") ??
          Number.POSITIVE_INFINITY;
        const tierB =
          getNumericAttribute(b.beast ?? null, "Tier") ??
          Number.POSITIVE_INFINITY;
        return tierB - tierA || a.tokenId.localeCompare(b.tokenId);
      });
    case "health-desc":
      return copy.sort((a, b) => {
        const healthA =
          getNumericAttribute(a.beast ?? null, "Health") ?? -Infinity;
        const healthB =
          getNumericAttribute(b.beast ?? null, "Health") ?? -Infinity;
        if (healthA === healthB) {
          return a.tokenId.localeCompare(b.tokenId);
        }
        return healthB - healthA;
      });
    case "health-asc":
      return copy.sort((a, b) => {
        const healthA =
          getNumericAttribute(a.beast ?? null, "Health") ?? -Infinity;
        const healthB =
          getNumericAttribute(b.beast ?? null, "Health") ?? -Infinity;
        if (healthA === healthB) {
          return a.tokenId.localeCompare(b.tokenId);
        }
        return healthA - healthB;
      });
    case "rank-asc":
      return copy.sort((a, b) => {
        const rankA =
          getNumericAttribute(a.beast ?? null, "Rank") ??
          Number.POSITIVE_INFINITY;
        const rankB =
          getNumericAttribute(b.beast ?? null, "Rank") ??
          Number.POSITIVE_INFINITY;
        return rankA - rankB || a.tokenId.localeCompare(b.tokenId);
      });
    case "rank-desc":
      return copy.sort((a, b) => {
        const rankA =
          getNumericAttribute(a.beast ?? null, "Rank") ??
          Number.POSITIVE_INFINITY;
        const rankB =
          getNumericAttribute(b.beast ?? null, "Rank") ??
          Number.POSITIVE_INFINITY;
        return rankB - rankA || a.tokenId.localeCompare(b.tokenId);
      });
    case "last-death-desc":
      return copy.sort((a, b) => {
        const deathA =
          getNumericAttribute(a.beast ?? null, "Last Death Timestamp") ??
          getNumericAttribute(a.beast ?? null, "last death timestamp") ??
          0;
        const deathB =
          getNumericAttribute(b.beast ?? null, "Last Death Timestamp") ??
          getNumericAttribute(b.beast ?? null, "last death timestamp") ??
          0;
        if (deathA === deathB) {
          return a.tokenId.localeCompare(b.tokenId);
        }
        return deathB - deathA;
      });
    case "last-death-asc":
      return copy.sort((a, b) => {
        const deathA =
          getNumericAttribute(a.beast ?? null, "Last Death Timestamp") ??
          getNumericAttribute(a.beast ?? null, "last death timestamp") ??
          0;
        const deathB =
          getNumericAttribute(b.beast ?? null, "Last Death Timestamp") ??
          getNumericAttribute(b.beast ?? null, "last death timestamp") ??
          0;
        if (deathA === deathB) {
          return a.tokenId.localeCompare(b.tokenId);
        }
        return deathA - deathB;
      });
    case "price-asc":
      return copy.sort((a, b) => {
        try {
          const compA = getComparablePrice(a);
          const compB = getComparablePrice(b);

          // Sort by currency first to group same-currency listings
          if (compA.currency !== compB.currency) {
            return compA.currency.localeCompare(compB.currency);
          }

          // Then sort by price within the same currency
          if (compA.value === compB.value) {
            return a.tokenId.localeCompare(b.tokenId);
          }
          return compA.value < compB.value ? -1 : 1;
        } catch {
          return a.tokenId.localeCompare(b.tokenId);
        }
      });
    case "price-desc":
      return copy.sort((a, b) => {
        try {
          const compA = getComparablePrice(a);
          const compB = getComparablePrice(b);

          // Sort by currency first to group same-currency listings
          if (compA.currency !== compB.currency) {
            return compA.currency.localeCompare(compB.currency);
          }

          // Then sort by price within the same currency (descending)
          if (compA.value === compB.value) {
            return a.tokenId.localeCompare(b.tokenId);
          }
          return compA.value > compB.value ? -1 : 1;
        } catch {
          return a.tokenId.localeCompare(b.tokenId);
        }
      });
    case "default":
    default:
      return copy.sort((a, b) => {
        const powerA = a.beast?.power ?? -Infinity;
        const powerB = b.beast?.power ?? -Infinity;
        if (powerA === powerB) {
          return a.tokenId.localeCompare(b.tokenId);
        }
        return powerB - powerA;
      });
  }
}

/**
 * Sort beasts based on the selected sort option
 * @param beasts - Array of beasts to sort
 * @param option - Sort option to apply
 * @returns Sorted array of beasts
 */
export function sortBeasts(beasts: Beast[], option: SortOption): Beast[] {
  const copy = [...beasts];

  switch (option) {
    case "beast-asc":
      return copy.sort((a, b) => {
        const traitA = getAttributeValues(a, "Beast")[0] ?? a.name ?? "";
        const traitB = getAttributeValues(b, "Beast")[0] ?? b.name ?? "";
        const compare = traitA.localeCompare(traitB);
        if (compare !== 0) {
          return compare;
        }
        return a.numericId - b.numericId;
      });
    case "beast-desc":
      return copy.sort((a, b) => {
        const traitA = getAttributeValues(a, "Beast")[0] ?? a.name ?? "";
        const traitB = getAttributeValues(b, "Beast")[0] ?? b.name ?? "";
        const compare = traitB.localeCompare(traitA);
        if (compare !== 0) {
          return compare;
        }
        return a.numericId - b.numericId;
      });
    case "tier-asc":
      return copy.sort((a, b) => {
        const tierA =
          getNumericAttribute(a, "Tier") ?? Number.POSITIVE_INFINITY;
        const tierB =
          getNumericAttribute(b, "Tier") ?? Number.POSITIVE_INFINITY;
        if (tierA === tierB) {
          return a.numericId - b.numericId;
        }
        return tierA - tierB;
      });
    case "tier-desc":
      return copy.sort((a, b) => {
        const tierA =
          getNumericAttribute(a, "Tier") ?? Number.POSITIVE_INFINITY;
        const tierB =
          getNumericAttribute(b, "Tier") ?? Number.POSITIVE_INFINITY;
        if (tierA === tierB) {
          return a.numericId - b.numericId;
        }
        return tierB - tierA;
      });
    case "health-desc":
      return copy.sort((a, b) => {
        const healthA = getNumericAttribute(a, "Health") ?? -Infinity;
        const healthB = getNumericAttribute(b, "Health") ?? -Infinity;
        if (healthA === healthB) {
          return a.numericId - b.numericId;
        }
        return healthB - healthA;
      });
    case "health-asc":
      return copy.sort((a, b) => {
        const healthA = getNumericAttribute(a, "Health") ?? -Infinity;
        const healthB = getNumericAttribute(b, "Health") ?? -Infinity;
        if (healthA === healthB) {
          return a.numericId - b.numericId;
        }
        return healthA - healthB;
      });
    case "rank-asc":
      return copy.sort((a, b) => {
        const rankA =
          getNumericAttribute(a, "Rank") ?? Number.POSITIVE_INFINITY;
        const rankB =
          getNumericAttribute(b, "Rank") ?? Number.POSITIVE_INFINITY;
        if (rankA === rankB) {
          return a.numericId - b.numericId;
        }
        return rankA - rankB;
      });
    case "rank-desc":
      return copy.sort((a, b) => {
        const rankA =
          getNumericAttribute(a, "Rank") ?? Number.POSITIVE_INFINITY;
        const rankB =
          getNumericAttribute(b, "Rank") ?? Number.POSITIVE_INFINITY;
        if (rankA === rankB) {
          return a.numericId - b.numericId;
        }
        return rankB - rankA;
      });
    case "last-death-desc":
      return copy.sort((a, b) => {
        const deathA =
          getNumericAttribute(a, "Last Death Timestamp") ??
          getNumericAttribute(a, "last death timestamp") ??
          0;
        const deathB =
          getNumericAttribute(b, "Last Death Timestamp") ??
          getNumericAttribute(b, "last death timestamp") ??
          0;
        if (deathA === deathB) {
          return a.numericId - b.numericId;
        }
        return deathB - deathA;
      });
    case "last-death-asc":
      return copy.sort((a, b) => {
        const deathA =
          getNumericAttribute(a, "Last Death Timestamp") ??
          getNumericAttribute(a, "last death timestamp") ??
          0;
        const deathB =
          getNumericAttribute(b, "Last Death Timestamp") ??
          getNumericAttribute(b, "last death timestamp") ??
          0;
        if (deathA === deathB) {
          return a.numericId - b.numericId;
        }
        return deathA - deathB;
      });
    case "default":
    default:
      return copy.sort((a, b) => {
        const powerA = a.power ?? -Infinity;
        const powerB = b.power ?? -Infinity;
        if (powerA === powerB) {
          return a.numericId - b.numericId;
        }
        return powerB - powerA;
      });
  }
}

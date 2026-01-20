/**
 * Sorting Utilities
 *
 * Sorting functions for beasts and listings.
 */

import type { Beast } from "../services/beast";
import type { Listing } from "../services/marketplace/types";
import type { SortOption } from "../components/sort/SortDropdown";
import {
  getAttributeValues,
  getNumericAttribute,
  getBeastLastDeathTimestamp,
} from "./beast";
import { toBigIntSafe } from "./bigint";

/**
 * Compare two strings for sorting (case-insensitive)
 */
function compareStrings(
  a: string | null | undefined,
  b: string | null | undefined
): number {
  const left = (a ?? "").toLowerCase();
  const right = (b ?? "").toLowerCase();
  return left.localeCompare(right);
}

/**
 * Get comparable price info from a listing
 */
function getComparablePrice(listing: Listing): { currency: string; value: bigint } {
  try {
    const price = toBigIntSafe(listing.price);
    const currency = listing.paymentToken?.toLowerCase() || "0x0";
    return { currency, value: price };
  } catch {
    return { currency: "0x0", value: 0n };
  }
}

/**
 * Sort listings based on the selected sort option
 * @param listings - Array of listings to sort
 * @param option - Sort option to apply
 * @returns Sorted array of listings (new array, original not mutated)
 */
export function sortListings(
  listings: Listing[],
  option: SortOption
): Listing[] {
  const copy = [...listings];

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
        return healthA === healthB
          ? a.tokenId.localeCompare(b.tokenId)
          : healthB - healthA;
      });

    case "health-asc":
      return copy.sort((a, b) => {
        const healthA =
          getNumericAttribute(a.beast ?? null, "Health") ?? -Infinity;
        const healthB =
          getNumericAttribute(b.beast ?? null, "Health") ?? -Infinity;
        return healthA === healthB
          ? a.tokenId.localeCompare(b.tokenId)
          : healthA - healthB;
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
        const deathA = getBeastLastDeathTimestamp(a.beast) ?? 0;
        const deathB = getBeastLastDeathTimestamp(b.beast) ?? 0;
        return deathA === deathB
          ? a.tokenId.localeCompare(b.tokenId)
          : deathB - deathA;
      });

    case "last-death-asc":
      return copy.sort((a, b) => {
        const deathA = getBeastLastDeathTimestamp(a.beast) ?? 0;
        const deathB = getBeastLastDeathTimestamp(b.beast) ?? 0;
        return deathA === deathB
          ? a.tokenId.localeCompare(b.tokenId)
          : deathA - deathB;
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
      // Sort by power descending
      return copy.sort((a, b) => {
        const powerA = a.beast?.power ?? -Infinity;
        const powerB = b.beast?.power ?? -Infinity;
        return powerA === powerB
          ? a.tokenId.localeCompare(b.tokenId)
          : powerB - powerA;
      });
  }
}

/**
 * Sort beasts based on the selected sort option
 * @param beasts - Array of beasts to sort
 * @param option - Sort option to apply
 * @returns Sorted array of beasts (new array, original not mutated)
 */
export function sortBeasts(beasts: Beast[], option: SortOption): Beast[] {
  const copy = [...beasts];

  switch (option) {
    case "beast-asc":
      return copy.sort((a, b) => {
        const traitA = getAttributeValues(a, "Beast")[0] ?? a.name ?? "";
        const traitB = getAttributeValues(b, "Beast")[0] ?? b.name ?? "";
        const compare = traitA.localeCompare(traitB);
        return compare !== 0 ? compare : a.numericId - b.numericId;
      });

    case "beast-desc":
      return copy.sort((a, b) => {
        const traitA = getAttributeValues(a, "Beast")[0] ?? a.name ?? "";
        const traitB = getAttributeValues(b, "Beast")[0] ?? b.name ?? "";
        const compare = traitB.localeCompare(traitA);
        return compare !== 0 ? compare : a.numericId - b.numericId;
      });

    case "tier-asc":
      return copy.sort((a, b) => {
        const tierA = getNumericAttribute(a, "Tier") ?? Number.POSITIVE_INFINITY;
        const tierB = getNumericAttribute(b, "Tier") ?? Number.POSITIVE_INFINITY;
        return tierA === tierB ? a.numericId - b.numericId : tierA - tierB;
      });

    case "tier-desc":
      return copy.sort((a, b) => {
        const tierA = getNumericAttribute(a, "Tier") ?? Number.POSITIVE_INFINITY;
        const tierB = getNumericAttribute(b, "Tier") ?? Number.POSITIVE_INFINITY;
        return tierA === tierB ? a.numericId - b.numericId : tierB - tierA;
      });

    case "health-desc":
      return copy.sort((a, b) => {
        const healthA = getNumericAttribute(a, "Health") ?? -Infinity;
        const healthB = getNumericAttribute(b, "Health") ?? -Infinity;
        return healthA === healthB ? a.numericId - b.numericId : healthB - healthA;
      });

    case "health-asc":
      return copy.sort((a, b) => {
        const healthA = getNumericAttribute(a, "Health") ?? -Infinity;
        const healthB = getNumericAttribute(b, "Health") ?? -Infinity;
        return healthA === healthB ? a.numericId - b.numericId : healthA - healthB;
      });

    case "rank-asc":
      return copy.sort((a, b) => {
        const rankA = getNumericAttribute(a, "Rank") ?? Number.POSITIVE_INFINITY;
        const rankB = getNumericAttribute(b, "Rank") ?? Number.POSITIVE_INFINITY;
        return rankA === rankB ? a.numericId - b.numericId : rankA - rankB;
      });

    case "rank-desc":
      return copy.sort((a, b) => {
        const rankA = getNumericAttribute(a, "Rank") ?? Number.POSITIVE_INFINITY;
        const rankB = getNumericAttribute(b, "Rank") ?? Number.POSITIVE_INFINITY;
        return rankA === rankB ? a.numericId - b.numericId : rankB - rankA;
      });

    case "last-death-desc":
      return copy.sort((a, b) => {
        const deathA = getBeastLastDeathTimestamp(a) ?? 0;
        const deathB = getBeastLastDeathTimestamp(b) ?? 0;
        return deathA === deathB ? a.numericId - b.numericId : deathB - deathA;
      });

    case "last-death-asc":
      return copy.sort((a, b) => {
        const deathA = getBeastLastDeathTimestamp(a) ?? 0;
        const deathB = getBeastLastDeathTimestamp(b) ?? 0;
        return deathA === deathB ? a.numericId - b.numericId : deathA - deathB;
      });

    case "default":
    default:
      // Sort by power descending
      return copy.sort((a, b) => {
        const powerA = a.power ?? -Infinity;
        const powerB = b.power ?? -Infinity;
        return powerA === powerB ? a.numericId - b.numericId : powerB - powerA;
      });
  }
}

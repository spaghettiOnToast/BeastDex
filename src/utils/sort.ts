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
 * Uses Schwartzian transform to pre-compute sort keys for O(n) key extraction
 * instead of O(n*log(n)) during comparison.
 *
 * @param beasts - Array of beasts to sort
 * @param option - Sort option to apply
 * @returns Sorted array of beasts (new array, original not mutated)
 */
export function sortBeasts(beasts: Beast[], option: SortOption): Beast[] {
  if (beasts.length <= 1) return [...beasts];

  // Pre-compute sort keys once (O(n)) instead of during each comparison (O(n*log(n)))
  type KeyedBeast = { beast: Beast; key: string | number };

  const getKey = (beast: Beast): string | number => {
    switch (option) {
      case "beast-asc":
      case "beast-desc":
        return getAttributeValues(beast, "Beast")[0] ?? beast.name ?? "";
      case "tier-asc":
      case "tier-desc":
        return getNumericAttribute(beast, "Tier") ?? Number.POSITIVE_INFINITY;
      case "health-asc":
      case "health-desc":
        return getNumericAttribute(beast, "Health") ?? -Infinity;
      case "rank-asc":
      case "rank-desc":
        return getNumericAttribute(beast, "Rank") ?? Number.POSITIVE_INFINITY;
      case "last-death-asc":
      case "last-death-desc":
        return getBeastLastDeathTimestamp(beast) ?? 0;
      case "default":
      default:
        return beast.power ?? -Infinity;
    }
  };

  // Create keyed array (Schwartzian transform step 1)
  const keyed: KeyedBeast[] = beasts.map(beast => ({ beast, key: getKey(beast) }));

  // Sort using pre-computed keys (step 2)
  const isDesc = option.endsWith("-desc") || option === "default";
  const isString = option === "beast-asc" || option === "beast-desc";

  keyed.sort((a, b) => {
    let compare: number;
    if (isString) {
      compare = (a.key as string).localeCompare(b.key as string);
    } else {
      compare = (a.key as number) - (b.key as number);
    }

    if (compare === 0) {
      return a.beast.numericId - b.beast.numericId;
    }
    return isDesc ? -compare : compare;
  });

  // Extract sorted beasts (step 3)
  return keyed.map(k => k.beast);
}

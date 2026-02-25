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

/** Minimal token info needed for USD price conversion during sorting */
export type TokenPriceInfo = {
  decimals: number;
  usdPrice: number | null;
};

/** Map of lowercased token address → price info */
export type TokenPriceMap = Map<string, TokenPriceInfo>;

/**
 * Convert a raw token amount to a USD value for cross-currency comparison.
 * Returns -1 if conversion isn't possible (missing price data).
 */
function toUsdValue(
  rawPrice: bigint,
  currency: string,
  tokenPriceMap?: TokenPriceMap
): number {
  if (!tokenPriceMap) return -1;
  const info = tokenPriceMap.get(currency);
  if (!info?.usdPrice) return -1;
  // Convert from token base units to human-readable, then multiply by USD price
  const humanAmount = Number(rawPrice) / 10 ** info.decimals;
  return humanAmount * info.usdPrice;
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
 * Uses Schwartzian transform to pre-compute sort keys for O(n) key extraction
 * instead of O(n*log(n)) during comparison.
 *
 * @param listings - Array of listings to sort
 * @param option - Sort option to apply
 * @returns Sorted array of listings (new array, original not mutated)
 */
export function sortListings(
  listings: Listing[],
  option: SortOption,
  unclaimedSkullsMap?: Map<number, number>,
  tokenPriceMap?: TokenPriceMap
): Listing[] {
  if (listings.length <= 1) return [...listings];

  // Special handling for "recent-desc" which needs complex comparison logic
  if (option === "recent-desc") {
    return [...listings].sort((a, b) => {
      const aTime = a.createdAt && a.createdAt > 0 ? a.createdAt : 0;
      const bTime = b.createdAt && b.createdAt > 0 ? b.createdAt : 0;

      // If both have timestamps, compare by timestamp (most recent first)
      if (aTime > 0 && bTime > 0) {
        return bTime - aTime;
      }
      // If only one has a timestamp, prefer the one without (likely more recent edit)
      if (aTime > 0 && bTime === 0) return 1;
      if (bTime > 0 && aTime === 0) return -1;
      // If neither has a timestamp, fall back to orderId (higher = more recent)
      return (b.orderId ?? 0) - (a.orderId ?? 0);
    });
  }

  // Pre-compute sort keys once (O(n)) instead of during each comparison
  type SortKey = { primary: string | number | bigint; secondary: string };
  type KeyedListing = { listing: Listing; key: SortKey };

  const getKey = (listing: Listing): SortKey => {
    const tokenId = listing.tokenId;
    const beast = listing.beast;

    switch (option) {
      case "beast-asc":
      case "beast-desc":
        return {
          primary: getAttributeValues(beast ?? null, "Beast")[0] ?? beast?.name ?? "",
          secondary: tokenId,
        };

      case "tier-asc":
      case "tier-desc":
        return {
          primary: getNumericAttribute(beast ?? null, "Tier") ?? Number.POSITIVE_INFINITY,
          secondary: tokenId,
        };

      case "health-asc":
      case "health-desc":
        return {
          primary: getNumericAttribute(beast ?? null, "Health") ?? -Infinity,
          secondary: tokenId,
        };

      case "rank-asc":
      case "rank-desc":
        return {
          primary: getNumericAttribute(beast ?? null, "Rank") ?? Number.POSITIVE_INFINITY,
          secondary: tokenId,
        };

      case "last-death-asc":
      case "last-death-desc":
        return {
          primary: getBeastLastDeathTimestamp(beast) ?? 0,
          secondary: tokenId,
        };

      case "skulls-desc":
        return {
          primary: unclaimedSkullsMap?.get(Number(tokenId)) ?? -1,
          secondary: tokenId,
        };

      case "price-asc":
      case "price-desc": {
        const comp = getComparablePrice(listing);
        const usd = toUsdValue(comp.value, comp.currency, tokenPriceMap);
        // Use USD value for cross-currency comparison; fall back to raw value within same currency
        return {
          primary: usd >= 0 ? usd : -1,
          secondary: `${comp.currency}:${comp.value.toString()}:${tokenId}`,
        };
      }

      case "default":
      default:
        return {
          primary: beast?.power ?? -Infinity,
          secondary: tokenId,
        };
    }
  };

  // Create keyed array (Schwartzian transform step 1)
  const keyed: KeyedListing[] = listings.map(listing => ({ listing, key: getKey(listing) }));

  // Determine sort direction and type
  const isDesc = option.endsWith("-desc") || option === "default";
  const isString = option === "beast-asc" || option === "beast-desc";
  const isPrice = option === "price-asc" || option === "price-desc";

  // Sort using pre-computed keys (step 2)
  keyed.sort((a, b) => {
    let compare: number;

    if (isPrice) {
      const usdA = a.key.primary as number;
      const usdB = b.key.primary as number;
      // Items without USD data (-1) sort to the end
      if (usdA < 0 && usdB >= 0) return 1;
      if (usdB < 0 && usdA >= 0) return -1;
      if (usdA < 0 && usdB < 0) {
        // Both lack USD data — fall back to same-currency raw value comparison
        const secA = a.key.secondary as string;
        const secB = b.key.secondary as string;
        const currA = secA.split(":")[0];
        const currB = secB.split(":")[0];
        if (currA !== currB) return currA.localeCompare(currB);
        const rawA = BigInt(secA.split(":")[1]);
        const rawB = BigInt(secB.split(":")[1]);
        compare = rawA === rawB ? 0 : rawA < rawB ? -1 : 1;
      } else {
        compare = usdA - usdB;
      }
    } else if (isString) {
      compare = (a.key.primary as string).toLowerCase().localeCompare(
        (b.key.primary as string).toLowerCase()
      );
    } else {
      compare = (a.key.primary as number) - (b.key.primary as number);
    }

    if (compare === 0) {
      return a.key.secondary.localeCompare(b.key.secondary);
    }
    return isDesc ? -compare : compare;
  });

  // Extract sorted listings (step 3)
  return keyed.map(k => k.listing);
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
export function sortBeasts(beasts: Beast[], option: SortOption, unclaimedSkullsMap?: Map<number, number>): Beast[] {
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
      case "skulls-desc":
        return unclaimedSkullsMap?.get(beast.numericId) ?? -1;
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

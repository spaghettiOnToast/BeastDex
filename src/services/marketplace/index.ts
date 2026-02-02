import { CategoryType, StatusType } from "@cartridge/arcade";
import { deriveTokenHex, fetchBeastsByIds } from "../beast";
import type { Beast } from "../beast";
import type { Listing, ListingStatus } from "./types";
import { compareStarknetAddresses } from "../../utils/address";
import type { ArcadeOrderWithTime } from "../../hooks/useArcadeOrders";

function getListingStatus(order: ArcadeOrderWithTime): ListingStatus {
  const now = Math.floor(Date.now() / 1000);
  const isExpired = order.expiration && order.expiration <= now;

  // Check order status first
  if (order.status.value === StatusType.Executed) {
    return "sold";
  }
  if (order.status.value === StatusType.Canceled) {
    return "cancelled";
  }

  // For Placed orders, check expiration
  if (order.status.value === StatusType.Placed) {
    if (isExpired) {
      return "expired";
    }
    return "active";
  }

  // Default to expired for unknown states
  return "expired";
}

function isActiveOrder(order: ArcadeOrderWithTime) {
  return (
    order.category.value === CategoryType.Sell &&
    getListingStatus(order) === "active"
  );
}

function toListingSkeleton(order: ArcadeOrderWithTime): Listing {
  const status = getListingStatus(order);

  return {
    listingId: order.identifier,
    tokenId: order.tokenId.toString(),
    seller: order.owner,
    price: order.price.toString(),
    paymentToken: order.currency,
    active: isActiveOrder(order),
    status,
    quantity: order.quantity,
    expiration: order.expiration,
    createdAt: order.listedAt, // Use actual listing time from event
    beast: null,
    orderId: order.id,
  };
}

// Beast metadata cache to avoid refetching
const beastCache = new Map<string, Beast | null>();

export async function hydrateOrders(orders: ArcadeOrderWithTime[]): Promise<Listing[]> {
  if (orders.length === 0) {
    return [];
  }

  const skeletons = orders.map(toListingSkeleton);
  const uniqueTokenIds = Array.from(
    new Set(skeletons.map((listing) => listing.tokenId))
  );

  const startTime = performance.now();
  const beastMap = new Map<string, Beast | null>();
  let cacheHits = 0;

  // Prime map with cached entries (only non-null - allow retry for previously failed)
  for (const tokenId of uniqueTokenIds) {
    const cached = beastCache.get(tokenId);
    if (cached !== undefined && cached !== null) {
      beastMap.set(tokenId, cached);
      cacheHits++;
    }
  }

  // Fetch any that aren't in cache OR are cached as null (retry failed lookups)
  const idsToFetch = uniqueTokenIds.filter((id) => {
    const cached = beastCache.get(id);
    return cached === undefined || cached === null;
  });
  const cacheMisses = idsToFetch.length;
  const BATCH_SIZE = 100; // Batch size for SQL queries
  const HYDRATION_TIMEOUT = 90000; // 90 second total timeout (accounts for 60s SQL timeout + retries)

  // Wrap hydration in a timeout to prevent indefinite blocking
  const hydrationPromise = (async () => {
    // Process batches sequentially to avoid overwhelming the indexer
    // The SQL client semaphore provides additional protection
    for (let i = 0; i < idsToFetch.length; i += BATCH_SIZE) {
      const chunk = idsToFetch.slice(i, i + BATCH_SIZE);

      try {
        const chunkBeasts = await fetchBeastsByIds(chunk);
        const indexes = buildBeastLookup(chunkBeasts);

        for (const identifier of chunk) {
          const beast = resolveBeastForIdentifier(identifier, indexes);
          // Only cache successful lookups - allow retry for missing beasts
          if (beast !== null) {
            beastCache.set(identifier, beast);
          } else if (import.meta.env.DEV) {
            // Log unmatched token IDs in dev mode to help debug
            console.warn(`[Hydration] No beast found for tokenId: ${identifier}`);
          }
          beastMap.set(identifier, beast);
        }
      } catch (error) {
        console.warn("[Hydration] Batch failed, continuing with nulls", error);
        // Don't cache failures - allow retry on next hydration
        // Just set in local map so listings show (with skeleton)
        for (const identifier of chunk) {
          if (!beastMap.has(identifier)) {
            beastMap.set(identifier, null);
          }
        }
      }
    }
  })();

  // Race hydration against timeout
  const timeoutPromise = new Promise<void>((resolve) => {
    setTimeout(() => {
      console.warn(`[Hydration] Timeout after ${HYDRATION_TIMEOUT}ms - proceeding with partial data`);
      resolve();
    }, HYDRATION_TIMEOUT);
  });

  await Promise.race([hydrationPromise, timeoutPromise]);

  const endTime = performance.now();
  const duration = (endTime - startTime).toFixed(0);
  const fetchedCount = Array.from(beastMap.values()).filter(b => b !== null).length;

  if (import.meta.env.DEV) {
    console.log(
      `[Hydration] Complete in ${duration}ms (${cacheHits} cached, ${fetchedCount}/${cacheMisses} fetched)`
    );
  }

  // Map listings with beast data
  const hydratedListings = skeletons.map((listing) => ({
    ...listing,
    beast: beastMap.get(listing.tokenId) ?? null,
  }));

  // Filter out listings where the seller no longer owns the token
  // BUT ONLY if we successfully fetched the beast data
  const validListings = hydratedListings.filter((listing) => {
    // If we don't have beast data, KEEP the listing (don't filter based on missing data)
    if (!listing.beast || !listing.beast.owner) {
      return true;
    }

    // Keep only listings where the seller still owns the token
    const isValid = compareStarknetAddresses(listing.seller, listing.beast.owner);

    if (!isValid && import.meta.env.DEV) {
      console.log(
        `[Hydration] Filtered out stale listing for token ${listing.tokenId}: seller=${listing.seller}, current owner=${listing.beast.owner}`
      );
    }

    return isValid;
  });

  if (import.meta.env.DEV && validListings.length < hydratedListings.length) {
    console.log(
      `[Hydration] Filtered out ${
        hydratedListings.length - validListings.length
      } stale listings`
    );
  }

  return validListings;
}

// Clear cache periodically or when needed
export function clearBeastCache() {
  beastCache.clear();
}

/**
 * Progressive hydration - hydrates priority items first, then the rest
 * Calls onProgress after each batch so UI can update incrementally
 */
export async function hydrateOrdersProgressive(
  orders: ArcadeOrderWithTime[],
  priorityTokenIds: string[],
  onProgress: (listings: Listing[]) => void
): Promise<Listing[]> {
  if (orders.length === 0) {
    return [];
  }

  const skeletons = orders.map(toListingSkeleton);
  const beastMap = new Map<string, Beast | null>();
  const BATCH_SIZE = 50; // Smaller batches for faster incremental updates
  const HYDRATION_TIMEOUT = 60000; // 60 second timeout for progressive hydration
  const startTime = Date.now();

  // Prime map with cached entries (only non-null - allow retry for previously failed)
  const allTokenIds = Array.from(new Set(skeletons.map((l) => l.tokenId)));
  for (const tokenId of allTokenIds) {
    const cached = beastCache.get(tokenId);
    if (cached !== undefined && cached !== null) {
      beastMap.set(tokenId, cached);
    }
  }

  // Helper to build current listings state
  const buildListings = () => {
    return skeletons.map((listing) => ({
      ...listing,
      beast: beastMap.get(listing.tokenId) ?? null,
    })).filter((listing) => {
      if (!listing.beast || !listing.beast.owner) return true;
      return compareStarknetAddresses(listing.seller, listing.beast.owner);
    });
  };

  // Helper to hydrate a batch
  const hydrateBatch = async (tokenIds: string[]) => {
    // Fetch any not in cache OR cached as null (retry failed lookups)
    const toFetch = tokenIds.filter((id) => {
      const cached = beastCache.get(id);
      return cached === undefined || cached === null;
    });
    if (toFetch.length === 0) return;

    try {
      const beasts = await fetchBeastsByIds(toFetch);
      const indexes = buildBeastLookup(beasts);

      if (import.meta.env.DEV) {
        console.log(`[Progressive Hydration] Batch: requested ${toFetch.length}, got ${beasts.length} beasts`);
      }

      for (const id of toFetch) {
        const beast = resolveBeastForIdentifier(id, indexes);
        // Only cache successful lookups - allow retry for missing beasts
        if (beast !== null) {
          beastCache.set(id, beast);
        } else if (import.meta.env.DEV) {
          console.warn(`[Hydration] No beast found for tokenId: ${id}`);
        }
        beastMap.set(id, beast);
      }
    } catch (error) {
      console.warn("[Progressive Hydration] Batch failed", error);
      // Don't cache failures - allow retry on next hydration
      // Just set in local map so listings show (with skeleton)
      for (const id of toFetch) {
        if (!beastMap.has(id)) beastMap.set(id, null);
      }
    }
  };

  // 1. Hydrate priority items first (visible page)
  const prioritySet = new Set(priorityTokenIds);
  // Include items cached as null (retry failed lookups)
  const priorityToHydrate = priorityTokenIds.filter((id) => {
    const cached = beastCache.get(id);
    return cached === undefined || cached === null;
  });

  for (let i = 0; i < priorityToHydrate.length; i += BATCH_SIZE) {
    // Check timeout
    if (Date.now() - startTime > HYDRATION_TIMEOUT) {
      console.warn(`[Progressive Hydration] Timeout after ${HYDRATION_TIMEOUT}ms - returning partial data`);
      break;
    }
    const chunk = priorityToHydrate.slice(i, i + BATCH_SIZE);
    await hydrateBatch(chunk);
  }

  // Emit progress after priority items are done
  onProgress(buildListings());

  // 2. Hydrate remaining items in background
  // Include items cached as null (retry failed lookups)
  const remainingIds = allTokenIds.filter((id) => {
    if (prioritySet.has(id)) return false;
    const cached = beastCache.get(id);
    return cached === undefined || cached === null;
  });

  for (let i = 0; i < remainingIds.length; i += BATCH_SIZE) {
    // Check timeout
    if (Date.now() - startTime > HYDRATION_TIMEOUT) {
      console.warn(`[Progressive Hydration] Timeout after ${HYDRATION_TIMEOUT}ms - returning partial data`);
      break;
    }
    const chunk = remainingIds.slice(i, i + BATCH_SIZE);
    await hydrateBatch(chunk);

    // Emit progress every few batches to avoid too many re-renders
    if ((i / BATCH_SIZE) % 3 === 0) {
      onProgress(buildListings());
    }
  }

  const finalListings = buildListings();
  onProgress(finalListings);
  return finalListings;
}

function buildBeastLookup(beasts: Beast[]) {
  const byId = new Map<string, Beast>();
  const byHex = new Map<string, Beast>();
  const byNumeric = new Map<string, Beast>();

  for (const beast of beasts) {
    const normalisedId = beast.id?.trim().toLowerCase();
    if (normalisedId) {
      byId.set(normalisedId, beast);
    }

    const derivedHexes = deriveTokenHex(beast.id ?? "");
    for (const hex of derivedHexes) {
      byHex.set(hex.toLowerCase(), beast);
    }

    if (
      typeof beast.numericId === "number" &&
      Number.isFinite(beast.numericId)
    ) {
      byNumeric.set(String(beast.numericId), beast);
    }
  }

  return { byId, byHex, byNumeric };
}

function resolveBeastForIdentifier(
  identifier: string,
  lookup: ReturnType<typeof buildBeastLookup>
): Beast | null {
  const normalised = identifier?.trim().toLowerCase();
  if (normalised && lookup.byId.has(normalised)) {
    return lookup.byId.get(normalised) ?? null;
  }

  const derivedHexes = deriveTokenHex(identifier ?? "");
  for (const hex of derivedHexes) {
    const match = lookup.byHex.get(hex.toLowerCase());
    if (match) return match;
  }

  const numeric = extractNumeric(identifier);
  if (numeric != null) {
    const match = lookup.byNumeric.get(String(numeric));
    if (match) return match;
  }

  return null;
}

function extractNumeric(value: string): number | null {
  if (!value) return null;
  const matches = value.match(/\d+/g);
  if (!matches || matches.length === 0) return null;
  const last = matches[matches.length - 1];
  const parsed = Number.parseInt(last, 10);
  return Number.isNaN(parsed) ? null : parsed;
}

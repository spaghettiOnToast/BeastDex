import type { OrderModel } from "@cartridge/marketplace";
import { CategoryType, StatusType } from "@cartridge/marketplace";
import { deriveTokenHex, fetchBeastsByIds } from "../beast";
import type { Beast } from "../beast";
import type { Listing, ListingStatus } from "./types";

function getListingStatus(order: OrderModel): ListingStatus {
  const now = Math.floor(Date.now() / 1000);
  const isExpired = order.expiration && order.expiration <= now;

  // Check order status first
  if (order.status.value === StatusType.Executed) {
    return "sold";
  }
  if (order.status.value === StatusType.Canceled) {
    return "canceled";
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

function isActiveOrder(order: OrderModel) {
  return (
    order.category.value === CategoryType.Sell &&
    getListingStatus(order) === "active"
  );
}

function toListingSkeleton(order: OrderModel): Listing {
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
    beast: null,
    orderId: order.id,
  };
}

// Beast metadata cache to avoid refetching
const beastCache = new Map<string, Beast | null>();

export async function hydrateOrders(orders: OrderModel[]): Promise<Listing[]> {
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

  // Prime map with cached entries
  for (const tokenId of uniqueTokenIds) {
    if (beastCache.has(tokenId)) {
      beastMap.set(tokenId, beastCache.get(tokenId)!);
      cacheHits++;
    }
  }

  const idsToFetch = uniqueTokenIds.filter((id) => !beastCache.has(id));
  const cacheMisses = idsToFetch.length;
  const BATCH_SIZE = 100;

  for (let i = 0; i < idsToFetch.length; i += BATCH_SIZE) {
    const chunk = idsToFetch.slice(i, i + BATCH_SIZE);
    try {
      const chunkBeasts = await fetchBeastsByIds(chunk);
      const indexes = buildBeastLookup(chunkBeasts);

      for (const identifier of chunk) {
        const beast = resolveBeastForIdentifier(identifier, indexes);
        beastCache.set(identifier, beast);
        beastMap.set(identifier, beast);
      }
    } catch (error) {
      console.error("[Hydration] Failed to batch fetch beasts", error);
      for (const identifier of chunk) {
        if (!beastCache.has(identifier)) {
          beastCache.set(identifier, null);
        }
        if (!beastMap.has(identifier)) {
          beastMap.set(identifier, beastCache.get(identifier) ?? null);
        }
      }
    }
  }

  const endTime = performance.now();
  if (import.meta.env.DEV) {
    console.log(
      `[Hydration] Complete in ${(endTime - startTime).toFixed(
        0
      )}ms (${cacheHits} cached, ${cacheMisses} fetched)`
    );
  }

  // Map listings with beast data and filter out stale listings
  const hydratedListings = skeletons.map((listing) => ({
    ...listing,
    beast: beastMap.get(listing.tokenId) ?? null,
  }));

  // Filter out listings where the seller no longer owns the token
  const validListings = hydratedListings.filter((listing) => {
    // If we don't have beast data, keep the listing (benefit of the doubt)
    if (!listing.beast || !listing.beast.owner) {
      return true;
    }

    // Normalize addresses for comparison (case-insensitive)
    const sellerAddress = listing.seller?.toLowerCase();
    const currentOwner = listing.beast.owner.toLowerCase();

    // Keep only listings where the seller still owns the token
    const isValid = sellerAddress === currentOwner;

    if (!isValid && import.meta.env.DEV) {
      console.log(
        `[Hydration] Filtered out stale listing for token ${listing.tokenId}: seller=${sellerAddress}, current owner=${currentOwner}`
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

  console.log(validListings);

  return validListings;
}

// Clear cache periodically or when needed
export function clearBeastCache() {
  beastCache.clear();
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

    const derivedHex = deriveTokenHex(beast.id ?? "");
    if (derivedHex) {
      byHex.set(derivedHex.toLowerCase(), beast);
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

  const derivedHex = deriveTokenHex(identifier ?? "");
  if (derivedHex) {
    const match = lookup.byHex.get(derivedHex.toLowerCase());
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

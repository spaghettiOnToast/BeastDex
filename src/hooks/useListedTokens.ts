/**
 * Lightweight hook for checking if tokens are listed
 *
 * This hook only fetches Arcade order data (fast GraphQL query)
 * WITHOUT triggering beast hydration (which hits pg-beasts).
 *
 * Use this on pages that just need to check listing status
 * without needing full beast metadata for listings.
 */
import { useMemo } from "react";
import { useArcadeListedTokensForCollection, type ArcadeOrderWithTime } from "./useArcadeOrders";
import { BEASTS_COLLECTION_ADDRESS } from "../services/marketplace/constants";
import { useSoldListings } from "../contexts/SoldListingsContext";
import type { Listing } from "../services/marketplace/types";

/**
 * Lightweight listing info - compatible with Listing type but without beast data
 */
export type ListingInfo = Omit<Listing, "beast" | "createdAt"> & {
  beast: null;
};

/**
 * Get lightweight listing info for a specific token
 * Does NOT trigger beast hydration - only uses Arcade GraphQL data
 */
export function useListedTokens() {
  const { isSold } = useSoldListings();

  const {
    data: listedOrders = [],
    isLoading,
    isFetching,
  } = useArcadeListedTokensForCollection(BEASTS_COLLECTION_ADDRESS) as {
    data: ArcadeOrderWithTime[];
    isLoading: boolean;
    isFetching: boolean;
  };

  // Build a map for O(1) token lookup
  const listingsByTokenId = useMemo(() => {
    const map = new Map<string, ListingInfo>();
    const now = Math.floor(Date.now() / 1000);

    for (const order of listedOrders) {
      // Skip optimistically sold listings
      if (isSold(order.identifier)) continue;

      const isExpired = order.expiration && order.expiration <= now;
      if (isExpired) continue;

      const tokenId = order.tokenId.toString();
      map.set(tokenId, {
        listingId: order.identifier,
        tokenId,
        seller: order.owner,
        price: order.price.toString(),
        paymentToken: order.currency,
        expiration: order.expiration,
        orderId: order.id,
        active: true,
        status: "active",
        quantity: order.quantity,
        beast: null,
      });
    }

    return map;
  }, [listedOrders, isSold]);

  // Get listing for a specific token
  const getListingForToken = (tokenId: string | number | undefined): ListingInfo | null => {
    if (!tokenId) return null;
    return listingsByTokenId.get(String(tokenId)) ?? null;
  };

  return {
    listingsByTokenId,
    getListingForToken,
    isLoading,
    isFetching,
    totalListings: listingsByTokenId.size,
  };
}

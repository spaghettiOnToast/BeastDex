import { useState, useEffect, useRef, useCallback } from "react";
import type { Listing, ListingStatus } from "../../../services/marketplace/types";
import { hydrateOrdersProgressive } from "../../../services/marketplace";
import { BEASTS_COLLECTION_ADDRESS } from "../../../services/marketplace/constants";
import { useArcadeListedTokensForCollection, type ArcadeOrderWithTime } from "../../../hooks/useArcadeOrders";

/** Check if an order is expired and return the appropriate status */
function getSkeletonStatus(order: ArcadeOrderWithTime): ListingStatus {
  const now = Math.floor(Date.now() / 1000);
  const isExpired = order.expiration && order.expiration <= now;
  return isExpired ? "expired" : "active";
}

export interface UseMarketplaceListingsResult {
  listings: Listing[];
  hydratingListings: boolean;
  listingsError: string | null;
  listedOrders: ArcadeOrderWithTime[];
  ordersLoading: boolean;
  ordersFetching: boolean;
  ordersError: unknown;
  refetchOrders: () => Promise<any>;
  /** Optimistically mark a listing as sold (removes from UI immediately) */
  markListingAsSold: (listingId: string) => void;
}

/**
 * Hook for fetching and hydrating marketplace listings
 * Fetches orders from Arcade and enriches them with beast metadata
 */
export function useMarketplaceListings(): UseMarketplaceListingsResult {
  const [listings, setListings] = useState<Listing[]>([]);
  const [hydratingListings, setHydratingListings] = useState(false);
  const [listingsError, setListingsError] = useState<string | null>(null);
  // Track listings that have been sold (optimistic update)
  const [soldListingIds, setSoldListingIds] = useState<Set<string>>(new Set());

  const prevOrdersRef = useRef<string>("");

  // Fetch orders from Arcade (now includes listedAt time)
  const {
    data: listedOrders = [],
    isLoading: ordersLoading,
    isFetching: ordersFetching,
    refetch: refetchOrders,
    error: ordersError,
  } = useArcadeListedTokensForCollection(
    BEASTS_COLLECTION_ADDRESS
  ) as unknown as {
    data: ArcadeOrderWithTime[];
    isLoading: boolean;
    isFetching: boolean;
    refetch: () => Promise<any>;
    error: unknown;
  };

  // Hydrate listings with beast data (progressive - first page loads fast)
  useEffect(() => {
    let cancelled = false;

    const hydrate = async () => {
      // Don't hydrate if we're currently loading
      if (ordersLoading || ordersFetching) return;

      // Check if orders have actually changed by comparing IDs (sorted to ignore order changes)
      const orderIds = listedOrders.map((o) => o.identifier).sort().join(",");

      if (prevOrdersRef.current === orderIds) {
        return; // Data hasn't changed, skip hydration
      }

      prevOrdersRef.current = orderIds;
      setHydratingListings(true);
      setListingsError(null);

      // Merge new listings with existing hydrated data to prevent flicker
      // while still allowing new listings to appear
      setListings((currentListings) => {
        // Build a map of existing hydrated listings by listingId
        const existingMap = new Map<string, Listing>();
        for (const listing of currentListings) {
          if (listing.beast !== null) {
            existingMap.set(listing.listingId, listing);
          }
        }

        // Create new listings array, preserving hydrated data where available
        return listedOrders.map((order: ArcadeOrderWithTime) => {
          const existing = existingMap.get(order.identifier);
          if (existing) {
            // Keep existing hydrated listing
            return existing;
          }
          // Create skeleton for new listing (check expiration for proper status)
          const status = getSkeletonStatus(order);
          return {
            listingId: order.identifier,
            tokenId: order.tokenId.toString(),
            seller: order.owner,
            price: order.price.toString(),
            paymentToken: order.currency,
            active: status === "active",
            status,
            quantity: order.quantity,
            expiration: order.expiration,
            createdAt: order.listedAt,
            beast: null,
            orderId: order.id,
          };
        });
      });

      // Priority token IDs - first 50 items (covers first page on both mobile and desktop)
      const priorityTokenIds = listedOrders.slice(0, 50).map((o) => o.tokenId.toString());

      try {
        // Progressive hydration - updates UI incrementally
        await hydrateOrdersProgressive(
          listedOrders,
          priorityTokenIds,
          (progressListings) => {
            if (cancelled) return;
            setListings(progressListings);
          }
        );

        if (cancelled) return;

        setListingsError(null);
        setHydratingListings(false);

        if (import.meta.env.DEV) {
          console.log("[Hydration] Complete - hydratingListings set to false");
        }

        // Clear optimistic sold IDs when we get fresh data from indexer
        setSoldListingIds((prev) => {
          const currentIds = new Set(listedOrders.map((l) => l.identifier));
          const stillPending = new Set<string>();
          prev.forEach((id) => {
            if (currentIds.has(id)) {
              stillPending.add(id);
            }
          });
          return stillPending;
        });
      } catch (error) {
        if (!cancelled) {
          setListings([]);
          const errorMsg =
            error instanceof Error ? error.message : "Failed to load listings";

          if (
            errorMsg.includes("502") ||
            errorMsg.includes("can't reach deployment")
          ) {
            setListingsError(
              "Indexer service is temporarily unavailable. Listings data cannot be displayed right now. Please try again in a few minutes."
            );
          } else {
            setListingsError(
              "Failed to load marketplace listings. Please try again."
            );
          }
          setHydratingListings(false);
        }
      }
    };

    hydrate();
    return () => {
      cancelled = true;
    };
  }, [listedOrders, ordersLoading, ordersFetching]);

  // Optimistically mark a listing as sold
  const markListingAsSold = useCallback((listingId: string) => {
    setSoldListingIds((prev) => new Set([...prev, listingId]));
  }, []);

  // Filter out optimistically sold listings
  const filteredListings = listings.filter(
    (listing) => !soldListingIds.has(listing.listingId)
  );

  return {
    listings: filteredListings,
    hydratingListings,
    listingsError,
    listedOrders,
    ordersLoading,
    ordersFetching,
    ordersError,
    refetchOrders,
    markListingAsSold,
  };
}

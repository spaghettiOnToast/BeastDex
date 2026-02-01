import { useState, useEffect, useRef, useCallback } from "react";
import type { Listing } from "../../../services/marketplace/types";
import { hydrateOrdersProgressive } from "../../../services/marketplace";
import { BEASTS_COLLECTION_ADDRESS } from "../../../services/marketplace/constants";
import { useArcadeListedTokensForCollection, type ArcadeOrderWithTime } from "../../../hooks/useArcadeOrders";

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
      // Check if orders have actually changed by comparing stringified version
      const ordersString = JSON.stringify(
        listedOrders.map((o) => ({
          id: o.id,
          identifier: o.identifier,
          tokenId: o.tokenId.toString(),
        }))
      );

      if (prevOrdersRef.current === ordersString) {
        return; // Data hasn't changed, skip hydration
      }

      // Don't hydrate if we're currently loading
      if (ordersLoading || ordersFetching) return;

      prevOrdersRef.current = ordersString;
      setHydratingListings(true);
      setListingsError(null);

      // Show skeletons immediately with active: true so they pass filters
      const skeletons = listedOrders.map((order: ArcadeOrderWithTime) => ({
        listingId: order.identifier,
        tokenId: order.tokenId.toString(),
        seller: order.owner,
        price: order.price.toString(),
        paymentToken: order.currency,
        active: true, // Mark as active so they show in filtered listings
        status: "active" as const,
        quantity: order.quantity,
        expiration: order.expiration,
        createdAt: order.listedAt,
        beast: null,
        orderId: order.id,
      }));
      setListings(skeletons);

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

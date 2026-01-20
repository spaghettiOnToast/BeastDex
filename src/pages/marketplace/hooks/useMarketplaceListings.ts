import { useState, useEffect, useRef } from "react";
import type { OrderModel } from "@cartridge/marketplace";
import type { Listing } from "../../../services/marketplace/types";
import { hydrateOrders } from "../../../services/marketplace";
import { BEASTS_COLLECTION_ADDRESS } from "../../../services/marketplace/constants";
import { useArcadeListedTokensForCollection } from "../../../hooks/useArcadeOrders";

export interface UseMarketplaceListingsResult {
  listings: Listing[];
  hydratingListings: boolean;
  listingsError: string | null;
  listedOrders: OrderModel[];
  ordersLoading: boolean;
  ordersFetching: boolean;
  ordersError: unknown;
  refetchOrders: () => Promise<any>;
}

/**
 * Hook for fetching and hydrating marketplace listings
 * Fetches orders from Arcade and enriches them with beast metadata
 */
export function useMarketplaceListings(): UseMarketplaceListingsResult {
  const [listings, setListings] = useState<Listing[]>([]);
  const [hydratingListings, setHydratingListings] = useState(false);
  const [listingsError, setListingsError] = useState<string | null>(null);

  const prevOrdersRef = useRef<string>("");

  // Fetch orders from Arcade
  const {
    data: listedOrders = [],
    isLoading: ordersLoading,
    isFetching: ordersFetching,
    refetch: refetchOrders,
    error: ordersError,
  } = useArcadeListedTokensForCollection(
    BEASTS_COLLECTION_ADDRESS
  ) as unknown as {
    data: OrderModel[];
    isLoading: boolean;
    isFetching: boolean;
    refetch: () => Promise<any>;
    error: unknown;
  };

  // Hydrate listings with beast data
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

      // Only show skeletons if we have a reasonable number
      // Otherwise it causes performance issues
      if (listedOrders.length <= 200) {
        const skeletons = listedOrders.map((order) => ({
          listingId: order.identifier,
          tokenId: order.tokenId.toString(),
          seller: order.owner,
          price: order.price.toString(),
          paymentToken: order.currency,
          active: false, // Will be updated after hydration
          status: "active" as const,
          quantity: order.quantity,
          expiration: order.expiration,
          beast: null,
          orderId: order.id,
        }));
        setListings(skeletons);
      }

      try {
        const listingsData = await hydrateOrders(listedOrders);
        if (cancelled) return;

        setListings(listingsData);
        setListingsError(null);
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
        }
      } finally {
        if (!cancelled) {
          setHydratingListings(false);
        }
      }
    };

    hydrate();
    return () => {
      cancelled = true;
    };
  }, [listedOrders, ordersLoading, ordersFetching]);

  return {
    listings,
    hydratingListings,
    listingsError,
    listedOrders,
    ordersLoading,
    ordersFetching,
    ordersError,
    refetchOrders,
  };
}

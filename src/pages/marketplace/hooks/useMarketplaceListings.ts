import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { Listing } from "../../../services/marketplace/types";
import { fetchListingsWithMetadataSingleQuery } from "../../../services/beast/marketplaceQuery";
import { useSoldListings } from "../../../contexts/SoldListingsContext";

export interface UseMarketplaceListingsResult {
  listings: Listing[];
  listingsError: string | null;
  ordersLoading: boolean;
  ordersFetching: boolean;
  ordersError: unknown;
  refetchOrders: () => Promise<any>;
  /** Optimistically mark a listing as sold (removes from UI immediately) */
  markListingAsSold: (listingId: string) => void;
}

/**
 * Hook for fetching marketplace listings with beast metadata
 *
 * OPTIMIZED: Uses a SINGLE SQL query to pg-beasts that joins
 * ARCADE-Order with tokens metadata. This replaces:
 * 1. Arcade GraphQL for orders
 * 2. Multiple batched hydration queries to pg-beasts
 *
 * One query to rule them all!
 */
export function useMarketplaceListings(): UseMarketplaceListingsResult {
  const queryClient = useQueryClient();
  const { markAsSold, clearStaleIds, isSold } = useSoldListings();

  // Single query fetches orders + metadata from pg-beasts
  const {
    data: listings = [],
    isLoading,
    isFetching,
    error,
    refetch,
  } = useQuery({
    queryKey: ["marketplaceListingsSingleQuery"],
    queryFn: async () => {
      const result = await fetchListingsWithMetadataSingleQuery();
      // Clear stale sold IDs when we get fresh data
      clearStaleIds(result.map((l) => l.listingId));
      return result;
    },
    staleTime: 30_000, // Consider data fresh for 30 seconds (reduced for fresher data)
    gcTime: 3 * 60_000, // Keep in cache for 3 minutes
    refetchOnWindowFocus: true,
    refetchOnMount: false,
    retry: 2,
  });

  // Filter out optimistically sold listings
  const filteredListings = listings.filter(
    (listing) => !isSold(listing.listingId)
  );

  // Manual refetch function
  const refetchOrders = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: ["marketplaceListingsSingleQuery"] });
    return refetch();
  }, [queryClient, refetch]);

  // Build error message
  let listingsError: string | null = null;
  if (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    if (errorMsg.includes("502") || errorMsg.includes("can't reach deployment") || errorMsg.includes("timed out")) {
      listingsError = "Indexer service is temporarily unavailable. Please try again in a few minutes.";
    } else {
      listingsError = "Failed to load marketplace listings. Please try again.";
    }
  }

  return {
    listings: filteredListings,
    listingsError,
    ordersLoading: isLoading,
    ordersFetching: isFetching,
    ordersError: error,
    refetchOrders,
    markListingAsSold: markAsSold,
  };
}

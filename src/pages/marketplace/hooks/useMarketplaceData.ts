import { useState, useCallback } from "react";
import type { Listing } from "../../../services/marketplace/types";
import { useMarketplaceListings } from "./useMarketplaceListings";
import { useUserBeasts } from "../../../hooks/useUserBeasts";
import { useBeastFilters } from "../../../hooks/useBeastFilters";

/**
 * Hook for managing all marketplace data fetching and state
 *
 * This hook composes several focused hooks:
 * - useMarketplaceListings: Handles order fetching and hydration
 * - useUserBeasts: Handles user's owned beasts
 * - useBeastFilters: Handles available filter options
 */
export function useMarketplaceData(address: string | undefined, _marketplace: any) {
  // Recent listings state (derived from main listings)
  const [recentListings, setRecentListings] = useState<Listing[]>([]);
  const [loadingRecentListings, setLoadingRecentListings] = useState(false);

  // Marketplace listings (orders + hydration)
  const listingsHook = useMarketplaceListings();

  // User's owned beasts
  const userBeastsHook = useUserBeasts(address);

  // Beast attribute filters
  const filtersHook = useBeastFilters();

  /**
   * Load recent listings (derived from main listings)
   */
  const loadRecentListings = useCallback(async () => {
    setLoadingRecentListings(true);
    try {
      // Use the actual listings data we already have, sorted by most recently created
      const recent = [...listingsHook.listings]
        .filter((listing) => listing.active)
        .slice(0, 50);

      setRecentListings(recent);
    } finally {
      setLoadingRecentListings(false);
    }
  }, [listingsHook.listings]);

  return {
    // Listings
    listings: listingsHook.listings,
    hydratingListings: listingsHook.hydratingListings,
    listingsError: listingsHook.listingsError,

    // Orders
    listedOrders: listingsHook.listedOrders,
    ordersLoading: listingsHook.ordersLoading,
    ordersFetching: listingsHook.ordersFetching,
    refetchOrders: listingsHook.refetchOrders,
    ordersError: listingsHook.ordersError,

    // Recent data
    recentListings,
    loadingRecentListings,
    loadRecentListings,

    // User beasts
    userBeasts: userBeastsHook.beasts,
    userBeastsLoading: userBeastsHook.loading,
    userBeastsError: userBeastsHook.error,
    reloadUserBeasts: userBeastsHook.reload,

    // Filters
    availableFilters: filtersHook.filters,
    filtersLoading: filtersHook.loading,
    filtersError: filtersHook.error,
  };
}

import { useMemo } from "react";
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
export function useMarketplaceData(address: string | undefined) {
  // Marketplace listings (orders + hydration)
  const listingsHook = useMarketplaceListings();

  // User's owned beasts
  const userBeastsHook = useUserBeasts(address);

  // Beast attribute filters
  const filtersHook = useBeastFilters();

  /**
   * Recent listings - automatically derived from main listings
   * Only shows active listings, sorted by most recently created (highest orderId first)
   */
  const recentListings = useMemo(() => {
    return [...listingsHook.listings]
      .filter((listing) => listing.active)
      .sort((a, b) => (b.orderId ?? 0) - (a.orderId ?? 0))
      .slice(0, 50);
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
    markListingAsSold: listingsHook.markListingAsSold,

    // Recent data (auto-updates when listings change)
    recentListings,

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

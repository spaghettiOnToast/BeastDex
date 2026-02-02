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
   * Only shows active listings, sorted by most recently created/edited
   * Falls back to orderId when createdAt is missing (e.g., for edited listings)
   */
  const recentListings = useMemo(() => {
    return [...listingsHook.listings]
      .filter((listing) => listing.active)
      .sort((a, b) => {
        // Use createdAt if available, otherwise fall back to orderId
        const aTime = a.createdAt && a.createdAt > 0 ? a.createdAt : 0;
        const bTime = b.createdAt && b.createdAt > 0 ? b.createdAt : 0;

        // If both have timestamps, compare by timestamp
        if (aTime > 0 && bTime > 0) {
          return bTime - aTime;
        }
        // If only one has a timestamp, that one is "older" (original listing)
        // Prefer the one without timestamp (likely edited more recently)
        if (aTime > 0 && bTime === 0) return 1;
        if (bTime > 0 && aTime === 0) return -1;
        // If neither has a timestamp, fall back to orderId (higher = more recent)
        return (b.orderId ?? 0) - (a.orderId ?? 0);
      })
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

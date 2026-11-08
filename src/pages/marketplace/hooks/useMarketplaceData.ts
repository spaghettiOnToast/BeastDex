import { useMemo } from "react";
import { MARKETPLACE_COLLECTION_ADDRESSES, marketplaceTokenKey } from "../../../services/marketplace/constants";
import { festivalCollectionFor } from "../../../services/festivalBeasts";
import { useFestivalTokens } from "../../../hooks/useFestivalTokens";
import { useMarketplaceListings } from "./useMarketplaceListings";
import { useUserBeasts } from "../../../hooks/useUserBeasts";
import { useBeastFilters } from "../../../hooks/useBeastFilters";
import { useBeastLookup } from "../../../hooks/useBeastLookup";

/**
 * Hook for managing all marketplace data fetching and state
 *
 * This hook composes several focused hooks:
 * - useMarketplaceListings: Handles order fetching and hydration
 * - useUserBeasts: Handles user's owned beasts (deferred loading)
 * - useBeastFilters: Handles available filter options
 */
export function useMarketplaceData(address: string | undefined) {
  // Marketplace listings (orders + hydration) for Beasts and every festival
  // collection, shown together in one grid.
  const listingsHook = useMarketplaceListings(MARKETPLACE_COLLECTION_ADDRESSES);

  // fetchListingsWithMetadataSingleQuery only fetches order data (beast: null).
  // Beasts are hydrated via the SDK (same as the Sold tab); festival tokens have
  // no Beast records and are hydrated from chain metadata instead.
  const beastListings = useMemo(
    () => listingsHook.listings.filter((l) => !festivalCollectionFor(l.collection)),
    [listingsHook.listings]
  );
  const listingTokenIds = useMemo(() => beastListings.map((l) => l.tokenId), [beastListings]);
  const { getBeast } = useBeastLookup(beastListings, listingTokenIds);
  const { getFestival, ownedKeys: ownedFestivalKeys } = useFestivalTokens();

  const listings = useMemo(
    () =>
      listingsHook.listings.map((l) =>
        festivalCollectionFor(l.collection)
          ? { ...l, beast: null, festival: getFestival(l.collection, l.tokenId) }
          : { ...l, beast: getBeast(l.tokenId) ?? null }
      ),
    [listingsHook.listings, getBeast, getFestival]
  );

  // User's owned beasts - defer loading until "My Listings" tab is opened
  // This reduces initial load by avoiding pagination queries upfront
  const userBeastsHook = useUserBeasts(address, { autoLoad: false });

  // Beast attribute filters
  const filtersHook = useBeastFilters();

  /**
   * Recent listings - automatically derived from main listings
   * Only shows active listings, sorted by most recently created/edited
   * Deduplicated by tokenId - keeps only the most recent listing per beast
   * Falls back to orderId when createdAt is missing (e.g., for edited listings)
   */
  const recentListings = useMemo(() => {
    // First deduplicate by tokenId, keeping the most recent listing per beast
    const listingsByTokenId = new Map<string, typeof listings[0]>();

    for (const listing of listings) {
      if (!listing.active) continue;

      // Collection-qualified: token ids repeat across Beasts and festival collections
      const tokenId = marketplaceTokenKey(listing.collection, String(listing.tokenId).trim());
      const existing = listingsByTokenId.get(tokenId);

      if (!existing) {
        listingsByTokenId.set(tokenId, listing);
      } else {
        // Keep the one with most recent createdAt, fall back to orderId
        const existingTime = existing.createdAt && existing.createdAt > 0 ? existing.createdAt : 0;
        const currentTime = listing.createdAt && listing.createdAt > 0 ? listing.createdAt : 0;

        const isNewer = currentTime > existingTime ||
          (currentTime === existingTime && (listing.orderId ?? 0) > (existing.orderId ?? 0));

        if (isNewer) {
          listingsByTokenId.set(tokenId, listing);
        }
      }
    }

    // Sort by recency and take top 102
    return Array.from(listingsByTokenId.values())
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
      .slice(0, 102);
  }, [listings]);

  return {
    // Listings
    listings,
    listingsError: listingsHook.listingsError,

    // Orders
    ordersLoading: listingsHook.ordersLoading,
    ordersFetching: listingsHook.ordersFetching,
    refetchOrders: listingsHook.refetchOrders,
    ordersError: listingsHook.ordersError,
    markListingAsSold: listingsHook.markListingAsSold,

    // Recent data (auto-updates when listings change)
    recentListings,

    // Festival token lookups (collection-qualified)
    ownedFestivalKeys,
    getFestival,

    // User beasts
    userBeasts: userBeastsHook.beasts,
    userBeastsLoading: userBeastsHook.loading,
    userBeastsHasLoaded: userBeastsHook.hasLoaded,
    userBeastsError: userBeastsHook.error,
    reloadUserBeasts: userBeastsHook.reload,

    // Filters
    availableFilters: filtersHook.filters,
    filtersLoading: filtersHook.loading,
    filtersError: filtersHook.error,
  };
}

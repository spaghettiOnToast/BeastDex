import { useState, useEffect, useCallback, useRef } from "react";
import type { Beast, BeastAttributeFilters } from "../../../services/beast";
import type { Listing } from "../../../services/marketplace/types";
import type { OrderModel } from "@cartridge/marketplace";
import { fetchBeasts, fetchBeastAttributeFilters } from "../../../services/beast";
import { hydrateOrders } from "../../../services/marketplace";
import { BEASTS_COLLECTION_ADDRESS } from "../../../services/marketplace/constants";
import { useArcadeListedTokensForCollection } from "../../../hooks/useArcadeOrders";
import { HIDDEN_FILTER_TRAITS } from "../utils";

/**
 * Hook for managing all marketplace data fetching and state
 */
export function useMarketplaceData(address: string | undefined, _marketplace: any) {
  // Listings state
  const [listings, setListings] = useState<Listing[]>([]);
  const [hydratingListings, setHydratingListings] = useState(false);
  const [listingsError, setListingsError] = useState<string | null>(null);

  // Recent data state
  const [recentListings, setRecentListings] = useState<Listing[]>([]);
  const [loadingRecentListings, setLoadingRecentListings] = useState(false);

  // User beasts state
  const [userBeasts, setUserBeasts] = useState<Beast[]>([]);
  const [userBeastsLoading, setUserBeastsLoading] = useState(false);
  const [userBeastsError, setUserBeastsError] = useState<string | null>(null);

  // Filters state
  const [availableFilters, setAvailableFilters] = useState<BeastAttributeFilters>({});
  const [filtersLoading, setFiltersLoading] = useState(true);
  const [filtersError, setFiltersError] = useState<string | null>(null);

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

  /**
   * Load available filters
   */
  useEffect(() => {
    let cancelled = false;

    const loadFilters = async () => {
      try {
        setFiltersLoading(true);
        setFiltersError(null);
        const filters = await fetchBeastAttributeFilters();
        if (cancelled) return;
        const cleanedEntries = (
          Array.isArray(Object.entries(filters))
            ? (Object.entries(filters) as Array<[string, string[]]>)
            : []
        ).filter(([trait]) => !HIDDEN_FILTER_TRAITS.has(trait.toLowerCase()));
        const cleaned = Object.fromEntries(
          cleanedEntries
        ) as BeastAttributeFilters;
        setAvailableFilters(cleaned);
      } catch (error) {
        if (!cancelled) {
          setFiltersError("Unable to load filters");
        }
      } finally {
        if (!cancelled) {
          setFiltersLoading(false);
        }
      }
    };

    loadFilters();
    return () => {
      cancelled = true;
    };
  }, []);

  /**
   * Hydrate listings with beast data
   */
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

        // Enhanced debugging for marketplace listings
        if (import.meta.env.DEV) {
          // Debug logging removed for production
        }

        // Store ALL listings (not just active ones)
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

  /**
   * Load user's beasts
   */
  const reloadUserBeasts = useCallback(async () => {
    if (!address) {
      setUserBeasts([]);
      setUserBeastsError(null);
      return;
    }
    setUserBeastsLoading(true);
    setUserBeastsError(null);
    try {
      const limit = 250;
      let page = 1;
      let results: Beast[] = [];
      let total = Infinity;

      while (results.length < total) {
        const { beasts, total: totalCount } = await fetchBeasts({
          limit,
          ownerAddresses: [address],
          page,
          sort: "default",
        });
        results = results.concat(beasts);
        total = typeof totalCount === "number" ? totalCount : results.length;
        if (beasts.length < limit) {
          break;
        }
        page += 1;
      }

      if (import.meta.env.DEV) {
        // Debug logging removed
      }
      setUserBeasts(results);
    } catch (error) {
      const errorMsg =
        error instanceof Error ? error.message : "Failed to load beasts";
      if (
        errorMsg.includes("502") ||
        errorMsg.includes("can't reach deployment")
      ) {
        setUserBeastsError(
          "Indexer service is temporarily unavailable. Your beasts are safe on-chain, but can't be displayed right now. Please try again in a few minutes."
        );
      } else {
        setUserBeastsError("Failed to load beasts. Please try again.");
      }
    } finally {
      setUserBeastsLoading(false);
    }
  }, [address]);

  /**
   * Load user beasts on address change
   */
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!address) {
        if (import.meta.env.DEV) {
          // Debug logging
        }
        setUserBeasts([]);
        setUserBeastsError(null);
        setUserBeastsLoading(false);
        return;
      }
      if (import.meta.env.DEV) {
        // Debug logging
      }
      setUserBeastsLoading(true);
      setUserBeastsError(null);
      try {
        const limit = 250;
        let page = 1;
        let results: Beast[] = [];
        let total = Infinity;

        while (results.length < total) {
          const { beasts, total: totalCount } = await fetchBeasts({
            limit,
            ownerAddresses: [address],
            page,
            sort: "default",
          });
          results = results.concat(beasts);
          total = typeof totalCount === "number" ? totalCount : results.length;
          if (beasts.length < limit) {
            break;
          }
          page += 1;
        }

        if (!cancelled) {
          if (import.meta.env.DEV) {
            // Debug logging
          }
          setUserBeasts(results);
          setUserBeastsError(null);
        }
      } catch (error) {
        if (!cancelled) {
          const errorMsg =
            error instanceof Error ? error.message : "Failed to load beasts";
          if (
            errorMsg.includes("502") ||
            errorMsg.includes("can't reach deployment")
          ) {
            setUserBeastsError(
              "Indexer service is temporarily unavailable. Your beasts are safe on-chain, but can't be displayed right now. Please try again in a few minutes."
            );
          } else {
            setUserBeastsError("Failed to load beasts. Please try again.");
          }
        }
      } finally {
        if (!cancelled) {
          setUserBeastsLoading(false);
        }
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [address]);

  /**
   * Load recent listings
   */
  const loadRecentListings = useCallback(async () => {
    setLoadingRecentListings(true);
    try {
      // Use the actual listings data we already have, sorted by most recently created
      // Since we don't have creation timestamps, we'll use the last 50 from the full listings
      const recent = [...listings]
        .filter((listing) => listing.active)
        .slice(0, 50); // Take first 50 from the already loaded listings

      setRecentListings(recent);
    } catch (error) {
      // Error handling
    } finally {
      setLoadingRecentListings(false);
    }
  }, [listings]);

  return {
    // Listings
    listings,
    hydratingListings,
    listingsError,

    // Orders
    listedOrders,
    ordersLoading,
    ordersFetching,
    refetchOrders,
    ordersError,

    // Recent data
    recentListings,
    loadingRecentListings,
    loadRecentListings,

    // User beasts
    userBeasts,
    userBeastsLoading,
    userBeastsError,
    reloadUserBeasts,

    // Filters
    availableFilters,
    filtersLoading,
    filtersError,
  };
}

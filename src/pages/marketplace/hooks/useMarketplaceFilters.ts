import { useState, useMemo, useCallback, useEffect } from "react";
import type { Beast, BeastAttributeFilters } from "../../../services/beast";
import type { Listing } from "../../../services/marketplace/types";
import type { SortOption } from "../../../components/sort/SortDropdown";
import type { RatesInSTRK } from "../../../services/marketplace/rates";
import { matchesAttributeFilters, matchesBeastFilters, sortListings, sortBeasts } from "../utils";
import type { MarketplaceView } from "../types";

export interface UseMarketplaceFiltersProps {
  listings: Listing[];
  userBeasts: Beast[];
  recentListings: Listing[];
  recentSales: Array<{ sale: any; beast: Beast | null }>;
  priceRates: RatesInSTRK | null | undefined;
  address: string | undefined;
  availableFilters: BeastAttributeFilters;
}

/**
 * Hook for managing marketplace filters, sorting, and computed listings
 */
export function useMarketplaceFilters({
  listings,
  userBeasts,
  recentListings,
  recentSales,
  address,
  availableFilters,
}: UseMarketplaceFiltersProps) {
  // Filter and sort state
  const [attributeFilters, setAttributeFilters] = useState<BeastAttributeFilters>({});
  const [sortOption, setSortOption] = useState<SortOption>("default");
  const [hideExpired, setHideExpired] = useState(true);
  const [hiddenListingIds, setHiddenListingIds] = useState<Set<string>>(new Set());
  const [showDuplicatesOnly, setShowDuplicatesOnly] = useState(false);
  const [showAllMyListings, setShowAllMyListings] = useState(false);
  const [activeTab, setActiveTab] = useState<MarketplaceView>("explore");
  const [visibleListingCount, setVisibleListingCount] = useState(120);

  /**
   * Load hidden listings from localStorage on mount
   */
  useEffect(() => {
    try {
      const raw = localStorage.getItem("beastdex:hidden-listings");
      if (!raw) return;
      const arr: string[] = JSON.parse(raw);
      if (Array.isArray(arr)) setHiddenListingIds(new Set(arr));
    } catch {}
  }, []);

  /**
   * Persist hidden listings to localStorage
   */
  useEffect(() => {
    try {
      localStorage.setItem(
        "beastdex:hidden-listings",
        JSON.stringify(Array.from(hiddenListingIds))
      );
    } catch {}
  }, [hiddenListingIds]);

  /**
   * Sync attribute filters with available filters
   */
  useEffect(() => {
    setAttributeFilters((prev) => {
      const nextEntries = (
        Object.entries(prev) as Array<[string, string[]]>
      ).filter(([trait]) =>
        Object.prototype.hasOwnProperty.call(availableFilters, trait)
      );
      return Object.fromEntries(nextEntries) as BeastAttributeFilters;
    });
  }, [availableFilters]);

  /**
   * Filter listings based on current filters
   */
  const filteredListings = useMemo(
    () =>
      listings
        .filter((listing) => !hiddenListingIds.has(listing.listingId))
        .filter(
          (listing): listing is Listing & { beast: Beast } =>
            listing.beast != null
        )
        .filter((listing) => {
          // Apply "Hide Expired" toggle
          if (hideExpired && listing.status === "expired") return false;
          return true;
        })
        .filter((listing) =>
          matchesAttributeFilters(listing, attributeFilters)
        ),
    [listings, attributeFilters, hiddenListingIds, hideExpired]
  );

  /**
   * Sort filtered listings
   */
  const sortedListings = useMemo(
    () => sortListings(filteredListings, sortOption),
    [filteredListings, sortOption]
  );

  /**
   * Filter recent listings (only those with names)
   */
  const namedRecentListings = useMemo(
    () =>
      recentListings.filter(
        (listing) => listing.beast?.name && listing.beast.name.trim().length > 0
      ),
    [recentListings]
  );

  /**
   * Filter recent sales (only those with names)
   */
  const namedRecentSales = useMemo(
    () =>
      recentSales.filter(
        ({ beast }) => beast?.name && beast.name.trim().length > 0
      ),
    [recentSales]
  );

  /**
   * Progressively load listings for performance
   */
  useEffect(() => {
    const target = sortedListings.length;
    const INITIAL = 120;
    const STEP = 60;

    if (activeTab !== "explore") {
      setVisibleListingCount(target);
      return;
    }

    setVisibleListingCount(Math.min(INITIAL, target));

    if (target <= INITIAL) {
      return;
    }

    let cancelled = false;
    let timer: number | null = null;

    const schedule = () => {
      if (cancelled || typeof window === "undefined") return;
      timer = window.setTimeout(() => {
        setVisibleListingCount((prev) => {
          if (prev >= target) {
            cancelled = true;
            return prev;
          }
          return Math.min(prev + STEP, target);
        });
        if (!cancelled) {
          schedule();
        }
      }, 90);
    };

    schedule();

    return () => {
      cancelled = true;
      if (timer !== null && typeof window !== "undefined") {
        window.clearTimeout(timer);
      }
    };
  }, [sortedListings, activeTab, hideExpired]);

  /**
   * Filter user beasts based on current filters
   */
  const filteredUserBeasts = useMemo(
    () =>
      userBeasts.filter((beast) =>
        matchesBeastFilters(beast, attributeFilters)
      ),
    [userBeasts, attributeFilters]
  );

  /**
   * Sort user beasts and optionally filter duplicates
   */
  const sortedUserBeasts = useMemo(() => {
    let beasts = sortBeasts(filteredUserBeasts, sortOption);

    if (showDuplicatesOnly) {
      // Group beasts by their beast type attribute to find duplicates
      const beastCounts = new Map<string, number>();
      beasts.forEach((beast) => {
        const beastTypeAttr = beast.attributes.find(
          (attr) => attr.trait_type?.toLowerCase() === "beast"
        );
        const key = beastTypeAttr?.value
          ? String(beastTypeAttr.value).trim().toLowerCase()
          : `unique_${beast.id}`;
        beastCounts.set(key, (beastCounts.get(key) || 0) + 1);
      });

      // Only keep beasts that have duplicates
      beasts = beasts.filter((beast) => {
        const beastTypeAttr = beast.attributes.find(
          (attr) => attr.trait_type?.toLowerCase() === "beast"
        );
        const key = beastTypeAttr?.value
          ? String(beastTypeAttr.value).trim().toLowerCase()
          : `unique_${beast.id}`;
        return (beastCounts.get(key) || 0) > 1;
      });
    }

    return beasts;
  }, [filteredUserBeasts, sortOption, showDuplicatesOnly]);

  /**
   * Get listings to render based on visible count
   */
  const listingsToRender = useMemo(() => {
    if (activeTab !== "explore") {
      return sortedListings;
    }
    const count = Math.min(visibleListingCount, sortedListings.length);
    return sortedListings.slice(0, count);
  }, [activeTab, sortedListings, visibleListingCount]);

  /**
   * Get user's active listings
   */
  const myActiveListings = useMemo(() => {
    if (!address) return [] as Listing[];
    const lower = address.toLowerCase();
    const base = showAllMyListings ? listings : sortedListings;
    return base.filter((listing) => listing.seller.toLowerCase() === lower);
  }, [sortedListings, listings, address, showAllMyListings]);

  /**
   * Track which token IDs are already actively listed
   */
  const alreadyListedTokenIds = useMemo(() => {
    const activeListings = myActiveListings.filter(
      (l) => l.status === "active"
    );
    return new Set(activeListings.map((l) => l.tokenId));
  }, [myActiveListings]);

  /**
   * Get all unique owner addresses for username fetching
   */
  const ownerAddresses = useMemo(
    () =>
      sortedListings
        .map((listing) => listing.seller?.toLowerCase?.() ?? "")
        .filter((addr) => addr.length > 0),
    [sortedListings]
  );

  /**
   * Handle filter change
   */
  const handleFilterChange = useCallback((trait: string, value: string) => {
    setAttributeFilters((prev) => {
      const next = { ...prev } as BeastAttributeFilters;
      if (value && value.trim().length > 0) {
        next[trait] = [value];
      } else {
        delete next[trait];
      }
      return next;
    });
  }, []);

  /**
   * Reset all filters
   */
  const handleResetFilters = useCallback(() => {
    setAttributeFilters({});
  }, []);

  /**
   * Hide a listing
   */
  const hideListingById = useCallback((listingId: string) => {
    setHiddenListingIds((prev) => new Set([...prev, listingId]));
  }, []);

  /**
   * Unhide a listing
   */
  const unhideListingById = useCallback((listingId: string) => {
    setHiddenListingIds((prev) => {
      const next = new Set(prev);
      next.delete(listingId);
      return next;
    });
  }, []);

  return {
    // State
    attributeFilters,
    sortOption,
    hideExpired,
    hiddenListingIds,
    showDuplicatesOnly,
    showAllMyListings,
    activeTab,
    visibleListingCount,

    // Setters
    setAttributeFilters,
    setSortOption,
    setHideExpired,
    setHiddenListingIds,
    setShowDuplicatesOnly,
    setShowAllMyListings,
    setActiveTab,

    // Computed values
    filteredListings,
    sortedListings,
    namedRecentListings,
    namedRecentSales,
    filteredUserBeasts,
    sortedUserBeasts,
    listingsToRender,
    myActiveListings,
    alreadyListedTokenIds,
    ownerAddresses,

    // Handlers
    handleFilterChange,
    handleResetFilters,
    hideListingById,
    unhideListingById,
  };
}

import { useState, useMemo, useCallback, useEffect, useRef } from "react";
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
  priceRates?: RatesInSTRK | null | undefined;
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
   * Filter listings based on current filters and deduplicate by tokenId
   * Only show one listing per beast - prefer active listings over expired ones
   */
  const filteredListings = useMemo(() => {
    // First, filter out hidden listings and those without beast data
    const baseListings = listings
      .filter((listing) => !hiddenListingIds.has(listing.listingId))
      .filter(
        (listing): listing is Listing & { beast: Beast } =>
          listing.beast != null
      );

    // Group listings by tokenId to deduplicate
    const listingsByTokenId = new Map<string, Array<Listing & { beast: Beast }>>();
    for (const listing of baseListings) {
      const tokenId = listing.tokenId;
      if (!listingsByTokenId.has(tokenId)) {
        listingsByTokenId.set(tokenId, []);
      }
      listingsByTokenId.get(tokenId)!.push(listing);
    }

    // For each tokenId, pick the best listing (active preferred, then by expiration)
    const deduplicatedListings: Array<Listing & { beast: Beast }> = [];
    for (const [, tokenListings] of listingsByTokenId) {
      // Separate active and non-active listings
      const activeListings = tokenListings.filter((l) => l.status === "active");

      if (activeListings.length > 0) {
        // Pick the active listing with the latest expiration (most time left)
        const bestActive = activeListings.reduce((best, current) => {
          const bestExp = best.expiration ?? 0;
          const currentExp = current.expiration ?? 0;
          return currentExp > bestExp ? current : best;
        });
        deduplicatedListings.push(bestActive);
      }
      // If no active listings exist for this tokenId, don't show any listing
      // (expired listings for the same beast are hidden)
    }

    // Apply "Hide Expired" toggle and attribute filters
    return deduplicatedListings
      .filter((listing) => {
        if (hideExpired && listing.status === "expired") return false;
        return true;
      })
      .filter((listing) => matchesAttributeFilters(listing, attributeFilters));
  }, [listings, attributeFilters, hiddenListingIds, hideExpired]);

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
   * Progressively load listings for performance
   */
  const progressiveLoadRef = useRef<{ cancelled: boolean; timer: number | null }>({
    cancelled: false,
    timer: null,
  });

  useEffect(() => {
    const target = sortedListings.length;
    const INITIAL = 120;
    const STEP = 60;
    const ref = progressiveLoadRef.current;

    // Clean up any previous progressive load
    ref.cancelled = true;
    if (ref.timer !== null) {
      window.clearTimeout(ref.timer);
      ref.timer = null;
    }

    if (activeTab !== "explore") {
      setVisibleListingCount(target);
      return;
    }

    setVisibleListingCount(Math.min(INITIAL, target));

    if (target <= INITIAL) {
      return;
    }

    // Start new progressive load
    ref.cancelled = false;

    const schedule = () => {
      if (ref.cancelled || typeof window === "undefined") return;
      ref.timer = window.setTimeout(() => {
        if (ref.cancelled) return;
        setVisibleListingCount((prev) => {
          const next = Math.min(prev + STEP, target);
          if (next >= target) {
            ref.cancelled = true;
          }
          return next;
        });
        if (!ref.cancelled) {
          schedule();
        }
      }, 90);
    };

    schedule();

    return () => {
      ref.cancelled = true;
      if (ref.timer !== null && typeof window !== "undefined") {
        window.clearTimeout(ref.timer);
        ref.timer = null;
      }
    };
  }, [sortedListings.length, activeTab]);

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

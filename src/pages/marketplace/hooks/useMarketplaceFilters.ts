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
  const [currentPage, setCurrentPage] = useState(1);

  // Pagination - fewer items on mobile for better performance
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;
  const ITEMS_PER_PAGE = isMobile ? 24 : 48;

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
    // Normalize tokenId to handle potential inconsistencies (trim, lowercase not needed for numbers)
    const listingsByTokenId = new Map<string, Array<Listing & { beast: Beast }>>();
    for (const listing of baseListings) {
      const tokenId = String(listing.tokenId).trim();
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
   * Filter recent listings (only those with names) and apply attribute filters + sorting
   */
  const namedRecentListings = useMemo(() => {
    // First filter to only those with beast names
    const withNames = recentListings.filter(
      (listing) => listing.beast?.name && listing.beast.name.trim().length > 0
    );

    // Apply attribute filters
    const filtered = withNames.filter((listing) =>
      matchesAttributeFilters(listing, attributeFilters)
    );

    // Apply sorting
    return sortListings(filtered, sortOption);
  }, [recentListings, attributeFilters, sortOption]);

  /**
   * Reset to page 1 when filters change
   */
  useEffect(() => {
    setCurrentPage(1);
  }, [attributeFilters, sortOption, hideExpired, activeTab]);

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
   * Get listings to render based on pagination
   */
  const listingsToRender = useMemo(() => {
    if (activeTab !== "explore") {
      return sortedListings;
    }
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    const endIndex = startIndex + ITEMS_PER_PAGE;
    return sortedListings.slice(startIndex, endIndex);
  }, [activeTab, sortedListings, currentPage, ITEMS_PER_PAGE]);

  /**
   * Calculate total pages for pagination
   */
  const totalPages = useMemo(() => {
    return Math.ceil(sortedListings.length / ITEMS_PER_PAGE);
  }, [sortedListings.length, ITEMS_PER_PAGE]);

  /**
   * Get user's active listings
   * Also filters out listings for NFTs the user no longer owns
   * (e.g., if they accepted an offer, the NFT transferred but the listing wasn't cancelled)
   */
  const myActiveListings = useMemo(() => {
    if (!address) return [] as Listing[];
    const lower = address.toLowerCase();
    const base = showAllMyListings ? listings : sortedListings;

    // Build a set of token IDs the user currently owns
    const ownedTokenIds = new Set<string>();
    for (const beast of userBeasts) {
      const rawTokenId = beast.id.split(":").pop() || beast.id;
      // Normalize: convert hex to decimal string for comparison
      const tokenId = rawTokenId.startsWith("0x")
        ? BigInt(rawTokenId).toString()
        : rawTokenId;
      ownedTokenIds.add(tokenId);
    }

    // Filter to listings where:
    // 1. The seller is the current user
    // 2. The user still owns the NFT (prevents stale listings from showing)
    return base.filter((listing) => {
      if (listing.seller.toLowerCase() !== lower) return false;
      // Check if user still owns this NFT
      const normalizedTokenId = String(listing.tokenId).trim();
      return ownedTokenIds.has(normalizedTokenId);
    });
  }, [sortedListings, listings, address, showAllMyListings, userBeasts]);

  /**
   * Track which token IDs are already actively listed
   * Uses raw listings (not filtered) to ensure we catch all listed beasts
   */
  const alreadyListedTokenIds = useMemo(() => {
    if (!address) return new Set<string>();
    const lower = address.toLowerCase();
    const userActiveListings = listings.filter(
      (l) => l.seller.toLowerCase() === lower && l.status === "active"
    );
    return new Set(userActiveListings.map((l) => String(l.tokenId).trim()));
  }, [listings, address]);

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
    currentPage,

    // Setters
    setAttributeFilters,
    setSortOption,
    setHideExpired,
    setHiddenListingIds,
    setShowDuplicatesOnly,
    setShowAllMyListings,
    setActiveTab,
    setCurrentPage,

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
    totalPages,
    itemsPerPage: ITEMS_PER_PAGE,

    // Handlers
    handleFilterChange,
    handleResetFilters,
    hideListingById,
    unhideListingById,
  };
}

import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import type { Beast, BeastAttributeFilters } from "../../../services/beast";
import type { Listing } from "../../../services/marketplace/types";
import type { SortOption } from "../../../components/sort/SortDropdown";
import type { RatesInSTRK } from "../../../services/marketplace/rates";
import { matchesAttributeFilters, matchesBeastFilters, sortListings, sortBeasts } from "../utils";
import { getNumericAttribute } from "../../../utils/beast";
import { fetchUnclaimedSkullsBatch } from "../../../services/summit";
import type { MarketplaceView } from "../types";

/** Parse a numeric token ID from a beast's hex/composite id string. */
function parseBeastTokenId(beastId: string): number {
  const raw = beastId.split(":").pop() || beastId;
  return raw.startsWith("0x") ? Number(BigInt(raw)) : Number(raw);
}

/**
 * Check whether a beast has confirmed unclaimed skulls.
 * Looks up pre-computed unclaimed count from the map (fetched via Summit API).
 */
function hasConfirmedUnclaimedSkulls(
  tokenId: string | number,
  unclaimedMap: Map<number, number>,
): boolean {
  const numericId = typeof tokenId === "string" ? Number(tokenId) : tokenId;
  const unclaimed = unclaimedMap.get(numericId);
  if (unclaimed === undefined) return false; // no data yet — don't show
  return unclaimed > 0;
}

export interface UseMarketplaceFiltersProps {
  listings: Listing[];
  userBeasts: Beast[];
  recentListings: Listing[];
  priceRates?: RatesInSTRK | null | undefined;
  address: string | undefined;
  availableFilters: BeastAttributeFilters;
  userBeastsLoading?: boolean;
  /** Whether user beasts have been loaded at least once */
  userBeastsHasLoaded?: boolean;
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
  userBeastsLoading = false,
  userBeastsHasLoaded = false,
}: UseMarketplaceFiltersProps) {
  // Filter and sort state
  const [attributeFilters, setAttributeFilters] = useState<BeastAttributeFilters>({});
  const [sortOption, setSortOption] = useState<SortOption>("price-asc");
  const [hideExpired, setHideExpired] = useState(true);
  const [hiddenListingIds, setHiddenListingIds] = useState<Set<string>>(new Set());
  const [showDuplicatesOnly, setShowDuplicatesOnly] = useState(false);
  const [showAllMyListings, setShowAllMyListings] = useState(false);
  const [activeTab, setActiveTab] = useState<MarketplaceView>("explore");
  const [currentPage, setCurrentPage] = useState(1);

  // Unclaimed skulls filter: when true, only show beasts with confirmed unclaimed skulls
  const [unclaimedSkullsFilter, setUnclaimedSkullsFilter] = useState(false);
  const [unclaimedSkullsMap, setSkullsClaimedMap] = useState<Map<number, number>>(new Map());
  const [skullsLoading, setSkullsLoading] = useState(false);
  const skullsFetchRef = useRef(0); // track latest fetch to avoid stale updates
  const skullsFetchedIdsRef = useRef<Set<number>>(new Set()); // track already-fetched/attempted token IDs

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
   * Fetch unclaimed skulls for beasts with kills > 0 when the filter is active.
   * Uses a ref (skullsFetchedIdsRef) to track already-fetched token IDs so we
   * never re-fetch the same token, even when listings change reference.
   */
  useEffect(() => {
    if (!unclaimedSkullsFilter) return;

    const fetchedIds = skullsFetchedIdsRef.current;

    // Collect tokens with kills > 0 that we haven't already fetched
    const tokensToFetch = new Map<number, number>(); // id → kills

    for (const listing of [...listings, ...recentListings]) {
      if (!listing.beast) continue;
      const kills = getNumericAttribute(listing.beast, "Adventurers Killed");
      if (kills && kills > 0) {
        const id = Number(listing.tokenId);
        if (!isNaN(id) && !fetchedIds.has(id)) {
          tokensToFetch.set(id, kills);
        }
      }
    }

    for (const beast of userBeasts) {
      const kills = getNumericAttribute(beast, "Adventurers Killed");
      if (kills && kills > 0) {
        const tokenId = parseBeastTokenId(beast.id);
        if (!isNaN(tokenId) && tokenId > 0 && !fetchedIds.has(tokenId)) {
          tokensToFetch.set(tokenId, kills);
        }
      }
    }

    if (tokensToFetch.size === 0) return;

    // Mark these IDs as fetched immediately so concurrent effect runs skip them
    for (const id of tokensToFetch.keys()) fetchedIds.add(id);

    const fetchId = ++skullsFetchRef.current;
    setSkullsLoading(true);

    const tokens = Array.from(tokensToFetch, ([id, kills]) => ({ id, kills }));

    fetchUnclaimedSkullsBatch(tokens, (batchMap) => {
      // Update map incrementally after each batch so results appear progressively
      setSkullsClaimedMap((prev) => {
        const merged = new Map(prev);
        for (const [k, v] of batchMap) merged.set(k, v);
        return merged;
      });
    }).then(() => {
      if (fetchId === skullsFetchRef.current) setSkullsLoading(false);
    }).catch(() => {
      if (fetchId === skullsFetchRef.current) setSkullsLoading(false);
    });
  }, [unclaimedSkullsFilter, listings, recentListings, userBeasts]);

  /**
   * Filter listings based on current filters and deduplicate by tokenId
   * Only show one listing per beast - prefer active listings over expired ones
   *
   * Optimized: Single pass for grouping + filtering combined
   */
  const filteredListings = useMemo(() => {
    // Single pass: group by tokenId while filtering out invalid listings
    const listingsByTokenId = new Map<string, Listing & { beast: Beast | null }>();

    if (import.meta.env.DEV) {
      const withoutBeast = listings.filter(l => !l.beast).length;
      console.log(`[Filter] Running filter: listings=${listings.length}, withoutBeast=${withoutBeast}`);
    }

    for (const listing of listings) {
      // Skip hidden listings
      if (hiddenListingIds.has(listing.listingId)) continue;

      // Skip expired if hideExpired is on
      if (hideExpired && listing.status === "expired") continue;

      // Only apply attribute filters if beast data is loaded
      if (listing.beast && !matchesAttributeFilters(listing as Listing & { beast: Beast }, attributeFilters)) continue;

      // Hide listings without beast data
      // (they couldn't be matched to beast metadata, so we can't verify ownership)
      if (!listing.beast) {
        if (import.meta.env.DEV) {
          console.log(`[Filter] Hiding listing ${listing.listingId} - no beast data`);
        }
        continue;
      }

      // Only consider active listings
      if (listing.status !== "active") continue;

      const tokenId = String(listing.tokenId).trim();
      const existing = listingsByTokenId.get(tokenId);

      if (!existing) {
        // First listing for this tokenId
        listingsByTokenId.set(tokenId, listing as Listing & { beast: Beast | null });
      } else {
        // Prefer listing with beast data over one without
        if (!existing.beast && listing.beast) {
          listingsByTokenId.set(tokenId, listing as Listing & { beast: Beast | null });
        } else if (existing.beast && listing.beast) {
          // Both have beast data - keep the one with most recent createdAt
          // Fall back to orderId if createdAt is missing (higher = more recent)
          const existingTime = existing.createdAt && existing.createdAt > 0 ? existing.createdAt : 0;
          const currentTime = listing.createdAt && listing.createdAt > 0 ? listing.createdAt : 0;

          // Compare by createdAt, then by orderId as fallback
          const isNewer = currentTime > existingTime ||
            (currentTime === existingTime && (listing.orderId ?? 0) > (existing.orderId ?? 0));

          if (isNewer) {
            listingsByTokenId.set(tokenId, listing as Listing & { beast: Beast | null });
          }
        }
      }
    }

    let result = Array.from(listingsByTokenId.values());

    // Apply unclaimed skulls filter — only show beasts with confirmed unclaimed skulls
    if (unclaimedSkullsFilter) {
      result = result.filter((listing) =>
        hasConfirmedUnclaimedSkulls(listing.tokenId, unclaimedSkullsMap)
      );
    }

    return result;
  }, [listings, attributeFilters, hiddenListingIds, hideExpired, unclaimedSkullsFilter, unclaimedSkullsMap]);

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
    let filtered = withNames.filter((listing) =>
      matchesAttributeFilters(listing, attributeFilters)
    );

    // Apply unclaimed skulls filter — only show beasts with confirmed unclaimed skulls
    if (unclaimedSkullsFilter) {
      filtered = filtered.filter((listing) =>
        hasConfirmedUnclaimedSkulls(listing.tokenId, unclaimedSkullsMap)
      );
    }

    // Apply user's chosen sort
    return sortListings(filtered, sortOption);
  }, [recentListings, attributeFilters, sortOption, unclaimedSkullsFilter, unclaimedSkullsMap]);

  /**
   * Reset to page 1 when filters change
   */
  useEffect(() => {
    setCurrentPage(1);
  }, [attributeFilters, sortOption, hideExpired, activeTab, unclaimedSkullsFilter]);

  /**
   * Set default sort based on active tab
   * - Explore: price-asc (cheapest first for buying)
   * - My Beasts: default (power descending)
   * - My Activity: price-asc
   */
  useEffect(() => {
    if (activeTab === "my-beasts") {
      setSortOption("default"); // "default" sorts by power descending
    } else if (activeTab === "explore" || activeTab === "my") {
      setSortOption("price-asc"); // Price low to high for marketplace browsing
    }
  }, [activeTab]);

  /**
   * Filter user beasts based on current filters
   */
  const filteredUserBeasts = useMemo(() => {
    let beasts = userBeasts.filter((beast) =>
      matchesBeastFilters(beast, attributeFilters)
    );

    // Apply unclaimed skulls filter — only show beasts with confirmed unclaimed skulls
    if (unclaimedSkullsFilter) {
      beasts = beasts.filter((beast) =>
        hasConfirmedUnclaimedSkulls(parseBeastTokenId(beast.id), unclaimedSkullsMap)
      );
    }

    return beasts;
  }, [userBeasts, attributeFilters, unclaimedSkullsFilter, unclaimedSkullsMap]);

  /**
   * Pre-compute beast type keys for duplicate detection (O(n) instead of O(n²))
   */
  const beastTypeKeyMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const beast of filteredUserBeasts) {
      const beastTypeAttr = beast.attributes.find(
        (attr) => attr.trait_type?.toLowerCase() === "beast"
      );
      const key = beastTypeAttr?.value
        ? String(beastTypeAttr.value).trim().toLowerCase()
        : `unique_${beast.id}`;
      map.set(beast.id, key);
    }
    return map;
  }, [filteredUserBeasts]);

  /**
   * Sort user beasts and optionally filter duplicates
   */
  const sortedUserBeasts = useMemo(() => {
    let beasts = sortBeasts(filteredUserBeasts, sortOption);

    if (showDuplicatesOnly) {
      // Count occurrences using pre-computed keys (O(n))
      const beastCounts = new Map<string, number>();
      for (const beast of beasts) {
        const key = beastTypeKeyMap.get(beast.id) || `unique_${beast.id}`;
        beastCounts.set(key, (beastCounts.get(key) || 0) + 1);
      }

      // Filter to duplicates only using pre-computed keys (O(n))
      beasts = beasts.filter((beast) => {
        const key = beastTypeKeyMap.get(beast.id) || `unique_${beast.id}`;
        return (beastCounts.get(key) || 0) > 1;
      });
    }

    return beasts;
  }, [filteredUserBeasts, sortOption, showDuplicatesOnly, beastTypeKeyMap]);

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
   * Paginate user beasts for better performance with large collections
   */
  const userBeastsToRender = useMemo(() => {
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    const endIndex = startIndex + ITEMS_PER_PAGE;
    return sortedUserBeasts.slice(startIndex, endIndex);
  }, [sortedUserBeasts, currentPage, ITEMS_PER_PAGE]);

  /**
   * Calculate total pages for user beasts
   */
  const totalUserBeastsPages = useMemo(() => {
    return Math.ceil(sortedUserBeasts.length / ITEMS_PER_PAGE);
  }, [sortedUserBeasts.length, ITEMS_PER_PAGE]);

  /**
   * Pre-compute normalized token IDs for beasts (avoid conversion in render loop)
   */
  const normalizedBeastTokenIds = useMemo(() => {
    const map = new Map<string, string>();
    for (const beast of userBeasts) {
      const rawTokenId = beast.id.split(":").pop() || beast.id;
      const tokenId = rawTokenId.startsWith("0x")
        ? BigInt(rawTokenId).toString()
        : rawTokenId;
      map.set(beast.id, tokenId);
    }
    return map;
  }, [userBeasts]);

  /**
   * Get user's active listings - NO DEDUPLICATION
   * Shows ALL of user's listings so they can manage duplicates (e.g., cancel one)
   * Also filters out listings for NFTs the user no longer owns
   * (e.g., if they accepted an offer, the NFT transferred but the listing wasn't cancelled)
   */
  const myActiveListings = useMemo(() => {
    if (!address) return [] as Listing[];
    const lower = address.toLowerCase();

    // Always use raw listings (no deduplication) so user can see and manage all their listings
    // Including duplicate listings for the same beast
    const base = listings;

    // Use pre-computed token IDs for owned beasts
    const ownedTokenIds = new Set(normalizedBeastTokenIds.values());

    // Filter to listings where the seller is the current user
    // Only apply ownership check if userBeasts has finished loading at least once
    // (prevents flicker where listings disappear then reappear, and prevents
    // showing 0 listings before beasts are loaded when autoLoad is false)
    const userListings = base.filter((listing) => {
      if (listing.seller.toLowerCase() !== lower) return false;

      // Skip hidden listings (unless showAllMyListings is enabled)
      if (!showAllMyListings && hiddenListingIds.has(listing.listingId)) return false;

      // Skip non-active listings (unless showAllMyListings is enabled to see cancelled/expired)
      if (!showAllMyListings && listing.status !== "active") return false;

      // Apply attribute filters if beast data exists (unless showAllMyListings is enabled)
      if (!showAllMyListings && listing.beast && !matchesAttributeFilters(listing as Listing & { beast: Beast }, attributeFilters)) return false;

      // Skip ownership check if beasts haven't been loaded yet or are currently loading
      // This ensures listings show correctly before the first beasts load completes
      if (!userBeastsHasLoaded || userBeastsLoading) return true;

      // Check if user still owns this NFT
      const normalizedTokenId = String(listing.tokenId).trim();
      return ownedTokenIds.has(normalizedTokenId);
    });

    // Sort by most recent first (createdAt or orderId)
    return userListings.sort((a, b) => {
      const aTime = a.createdAt && a.createdAt > 0 ? a.createdAt : 0;
      const bTime = b.createdAt && b.createdAt > 0 ? b.createdAt : 0;
      if (aTime !== bTime) return bTime - aTime;
      return (b.orderId ?? 0) - (a.orderId ?? 0);
    });
  }, [listings, address, showAllMyListings, hiddenListingIds, hideExpired, attributeFilters, normalizedBeastTokenIds, userBeastsLoading, userBeastsHasLoaded]);

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
   * Handle filter change (single value)
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
   * Handle multi-select filter change (multiple values)
   */
  const handleMultiFilterChange = useCallback((trait: string, values: string[]) => {
    setAttributeFilters((prev) => {
      const next = { ...prev } as BeastAttributeFilters;
      if (values && values.length > 0) {
        next[trait] = values;
      } else {
        delete next[trait];
      }
      return next;
    });
  }, []);

  /**
   * Handle rank range filter change
   */
  const handleRankRangeChange = useCallback((rankValues: string[]) => {
    setAttributeFilters((prev) => {
      const next = { ...prev } as BeastAttributeFilters;
      if (rankValues && rankValues.length > 0) {
        next["Rank"] = rankValues;
      } else {
        delete next["Rank"];
      }
      return next;
    });
  }, []);

  /**
   * Handle health range filter change
   * Pass negative values to signal "clear filter"
   */
  const handleHealthRangeChange = useCallback((min: number, max: number) => {
    setAttributeFilters((prev) => {
      const next = { ...prev } as BeastAttributeFilters;
      // Negative values signal to clear the filter
      if (min < 0 || max < 0 || (min <= 1 && max >= 1023)) {
        delete next["Health"];
      } else {
        // Generate array of health values in the range
        const healthValues: string[] = [];
        for (let i = min; i <= max; i++) {
          healthValues.push(String(i));
        }
        next["Health"] = healthValues;
      }
      return next;
    });
  }, []);

  /**
   * Handle level range filter change
   * Pass negative values to signal "clear filter"
   */
  const handleLevelRangeChange = useCallback((min: number, max: number) => {
    setAttributeFilters((prev) => {
      const next = { ...prev } as BeastAttributeFilters;
      // Negative values signal to clear the filter
      if (min < 0 || max < 0) {
        delete next["Level"];
      } else {
        // Generate array of level values in the range
        const levelValues: string[] = [];
        for (let i = min; i <= max; i++) {
          levelValues.push(String(i));
        }
        next["Level"] = levelValues;
      }
      return next;
    });
  }, []);

  /**
   * Handle adventurers killed range filter change
   * Pass negative values to signal "clear filter"
   */
  const handleAdventurersKilledRangeChange = useCallback((min: number, max: number) => {
    setAttributeFilters((prev) => {
      const next = { ...prev } as BeastAttributeFilters;
      // Negative values signal to clear the filter
      if (min < 0 || max < 0) {
        delete next["Adventurers Killed"];
      } else {
        // Generate array of values in the range
        const values: string[] = [];
        for (let i = min; i <= max; i++) {
          values.push(String(i));
        }
        next["Adventurers Killed"] = values;
      }
      return next;
    });
  }, []);

  /**
   * Handle unclaimed skulls filter change
   */
  const handleUnclaimedSkullsChange = useCallback((value: boolean) => {
    setUnclaimedSkullsFilter(value);
  }, []);

  /**
   * Reset all filters
   */
  const handleResetFilters = useCallback(() => {
    setAttributeFilters({});
    setUnclaimedSkullsFilter(false);
    setSkullsClaimedMap(new Map());
    skullsFetchedIdsRef.current = new Set();
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
    unclaimedSkullsFilter,
    skullsLoading,

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
    userBeastsToRender,
    listingsToRender,
    myActiveListings,
    alreadyListedTokenIds,
    normalizedBeastTokenIds,
    ownerAddresses,
    totalPages,
    totalUserBeastsPages,
    itemsPerPage: ITEMS_PER_PAGE,

    // Handlers
    handleFilterChange,
    handleMultiFilterChange,
    handleRankRangeChange,
    handleHealthRangeChange,
    handleLevelRangeChange,
    handleAdventurersKilledRangeChange,
    handleUnclaimedSkullsChange,
    handleResetFilters,
    hideListingById,
    unhideListingById,
  };
}

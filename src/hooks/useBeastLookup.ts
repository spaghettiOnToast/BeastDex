import { useMemo, useCallback } from "react";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { type Beast, fetchBeastsByIds } from "../services/beast";

interface ListingWithBeast {
  tokenId: string;
  beast?: Beast | null;
}

/** How many tokens to prioritize in the first-page fetch */
const FIRST_PAGE_SIZE = 50;

/** Index fetched beasts into a map with multiple key formats for reliable lookup. */
function indexBeasts(beasts: Beast[], into: Map<string, Beast>) {
  for (const beast of beasts) {
    // Store by numericId (most reliable for sales lookups)
    if (typeof beast.numericId === "number" && Number.isFinite(beast.numericId)) {
      into.set(String(beast.numericId), beast);
    }

    // Extract token ID from beast.id (format: "beasts_nft:0x123...")
    const rawTokenId = beast.id.split(":").pop() || beast.id;
    // Convert hex to decimal string for consistent lookup
    let tokenId = rawTokenId;
    if (rawTokenId.startsWith("0x")) {
      try {
        tokenId = BigInt(rawTokenId).toString();
      } catch {
        // Keep as-is if conversion fails
      }
    }
    into.set(tokenId, beast);
    into.set(rawTokenId, beast);
    into.set(beast.id, beast);
  }
}

/**
 * Hook for looking up beast data by token ID
 * Combines beast data from listings with fetched data for missing tokens.
 *
 * Uses a two-phase fetch strategy:
 * - Phase 1: Fetch first page of missing tokens (fast, renders first page instantly)
 * - Phase 2: Fetch remaining tokens in parallel (populates rest in background)
 */
export function useBeastLookup(
  listings: ListingWithBeast[],
  additionalTokenIds: string[] = []
) {
  // Create a map of tokenId -> beast from listings
  const beastMapFromListings = useMemo(() => {
    const map = new Map<string, Beast>();
    for (const listing of listings) {
      if (listing.beast) {
        map.set(listing.tokenId, listing.beast);
      }
    }
    return map;
  }, [listings]);

  // Only fetch beast data for tokens NOT already known from listings.
  // Preserves original order so first-page tokens are prioritized.
  const missingTokenIds = useMemo(() => {
    const seen = new Set<string>();
    const missing: string[] = [];
    for (const id of additionalTokenIds) {
      if (!seen.has(id) && !beastMapFromListings.has(id)) {
        seen.add(id);
        missing.push(id);
      }
    }
    return missing;
  }, [additionalTokenIds, beastMapFromListings]);

  // Split into first page (priority) and the rest
  const firstPageIds = useMemo(
    () => missingTokenIds.slice(0, FIRST_PAGE_SIZE),
    [missingTokenIds]
  );
  const remainingIds = useMemo(
    () => missingTokenIds.slice(FIRST_PAGE_SIZE),
    [missingTokenIds]
  );

  // Phase 1: Fast fetch for first page of missing tokens
  const firstPageKey = useMemo(
    () => ["beastLookup-first", firstPageIds.join(",")],
    [firstPageIds]
  );
  const { data: firstPageBeasts = [] } = useQuery({
    queryKey: firstPageKey,
    enabled: firstPageIds.length > 0,
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    placeholderData: keepPreviousData,
    queryFn: () => fetchBeastsByIds(firstPageIds),
  });

  // Phase 2: Background fetch for remaining tokens
  const remainingKey = useMemo(
    () => ["beastLookup-rest", remainingIds.join(",")],
    [remainingIds]
  );
  const { data: remainingBeasts = [], isLoading } = useQuery({
    queryKey: remainingKey,
    enabled: remainingIds.length > 0,
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    placeholderData: keepPreviousData,
    queryFn: () => fetchBeastsByIds(remainingIds),
  });

  // Combine all sources: fetched beasts first, then listings overlay (listings win)
  const beastMap = useMemo(() => {
    const map = new Map<string, Beast>();
    indexBeasts(remainingBeasts, map);
    indexBeasts(firstPageBeasts, map);
    // Listings data overlays on top (already-hydrated, potentially fresher)
    for (const [key, beast] of beastMapFromListings) {
      map.set(key, beast);
    }
    return map;
  }, [beastMapFromListings, firstPageBeasts, remainingBeasts]);

  // Memoized helper to get beast by token ID
  const getBeast = useCallback(
    (tokenId: string): Beast | undefined => {
      // Try direct lookup first
      let beast = beastMap.get(tokenId);
      if (beast) return beast;

      // Try converting to/from hex
      if (tokenId.startsWith("0x")) {
        try {
          beast = beastMap.get(BigInt(tokenId).toString());
          if (beast) return beast;
        } catch {
          // Ignore conversion errors
        }
      } else if (/^\d+$/.test(tokenId)) {
        try {
          const hex = "0x" + BigInt(tokenId).toString(16);
          beast = beastMap.get(hex);
          if (beast) return beast;
        } catch {
          // Ignore conversion errors
        }
      }

      return undefined;
    },
    [beastMap]
  );

  return {
    beastMap,
    getBeast,
    isLoading,
  };
}

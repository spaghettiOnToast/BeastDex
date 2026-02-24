import { useMemo, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { type Beast, fetchBeastsByIds } from "../services/beast";

interface ListingWithBeast {
  tokenId: string;
  beast?: Beast | null;
}

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
 * Combines beast data from listings with fetched data for missing tokens
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

  // Stable, deduplicated + sorted key for additionalTokenIds
  // This fires the fetch as soon as sale token IDs are known,
  // without waiting for listings to resolve first.
  const stableTokenIds = useMemo(() => {
    const unique = [...new Set(additionalTokenIds)].sort();
    return unique;
  }, [additionalTokenIds]);

  const queryKey = useMemo(
    () => ["beastLookup", stableTokenIds.join(",")],
    [stableTokenIds]
  );

  // Fetch beast data for all additional token IDs immediately
  const { data: fetchedBeasts = [], isLoading } = useQuery({
    queryKey,
    enabled: stableTokenIds.length > 0,
    staleTime: 10 * 60 * 1000, // 10 minutes - beast metadata is relatively stable
    gcTime: 30 * 60 * 1000, // Keep in cache for 30 minutes
    refetchOnWindowFocus: false,
    refetchOnMount: false, // Use cached data when available
    queryFn: () => fetchBeastsByIds(stableTokenIds),
  });

  // Combine: fetched beasts first, then listings overlay (listings win on conflict)
  const beastMap = useMemo(() => {
    const map = new Map<string, Beast>();
    indexBeasts(fetchedBeasts, map);
    // Listings data overlays on top (already-hydrated, potentially fresher)
    for (const [key, beast] of beastMapFromListings) {
      map.set(key, beast);
    }
    return map;
  }, [beastMapFromListings, fetchedBeasts]);

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

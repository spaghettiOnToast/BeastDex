import { useMemo, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { type Beast, fetchBeastsByIds } from "../services/beast";

interface ListingWithBeast {
  tokenId: string;
  beast?: Beast | null;
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

  // Find token IDs that don't have beast data in listings
  const missingTokenIds = useMemo(() => {
    const missing = new Set<string>();
    for (const tokenId of additionalTokenIds) {
      if (!beastMapFromListings.has(tokenId)) {
        missing.add(tokenId);
      }
    }
    return [...missing];
  }, [additionalTokenIds, beastMapFromListings]);

  // Fetch beast data for missing tokens
  const { data: fetchedBeasts = [], isLoading } = useQuery({
    queryKey: ["beastLookup", missingTokenIds.sort().join(",")],
    enabled: missingTokenIds.length > 0,
    staleTime: 10 * 60 * 1000, // 10 minutes - beast metadata is relatively stable
    gcTime: 30 * 60 * 1000, // Keep in cache for 30 minutes
    refetchOnWindowFocus: false,
    refetchOnMount: false, // Use cached data when available
    queryFn: () => fetchBeastsByIds(missingTokenIds),
  });

  // Combine beast data from listings and fetched data
  const beastMap = useMemo(() => {
    const map = new Map<string, Beast>(beastMapFromListings);
    for (const beast of fetchedBeasts) {
      // Store by numericId (most reliable for sales lookups)
      if (typeof beast.numericId === "number" && Number.isFinite(beast.numericId)) {
        map.set(String(beast.numericId), beast);
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
      map.set(tokenId, beast);
      // Also set with the raw ID in case it's looked up that way
      map.set(rawTokenId, beast);
      // Also store full ID for exact matches
      map.set(beast.id, beast);
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

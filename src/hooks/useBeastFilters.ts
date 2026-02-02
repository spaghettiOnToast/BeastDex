import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { BeastAttributeFilters } from "../services/beast";
import { fetchBeastAttributeFilters } from "../services/beast";

/** Traits that should not be shown in filter UI */
const HIDDEN_FILTER_TRAITS = new Set([
  "health",
  "power",
  "last death timestamp",
  "rank",
]);

export interface UseBeastFiltersResult {
  filters: BeastAttributeFilters;
  loading: boolean;
  error: string | null;
}

/**
 * Hook for fetching available beast attribute filters
 * Uses React Query for caching - filters are static data that rarely changes
 * Automatically filters out traits that shouldn't be shown in the UI
 */
export function useBeastFilters(): UseBeastFiltersResult {
  const { data, isLoading, error } = useQuery({
    queryKey: ["beastAttributeFilters"],
    queryFn: fetchBeastAttributeFilters,
    staleTime: 30 * 60 * 1000, // 30 minutes - filters rarely change
    gcTime: 60 * 60 * 1000, // Keep in cache for 1 hour
    refetchOnWindowFocus: false,
    refetchOnMount: false, // Use cached data, don't refetch on every mount
  });

  // Memoize the cleaned filters to avoid recalculating on every render
  const filters = useMemo(() => {
    if (!data) return {};

    // Remove hidden traits from filter options
    const cleanedEntries = (
      Array.isArray(Object.entries(data))
        ? (Object.entries(data) as Array<[string, string[]]>)
        : []
    ).filter(([trait]) => !HIDDEN_FILTER_TRAITS.has(trait.toLowerCase()));

    return Object.fromEntries(cleanedEntries) as BeastAttributeFilters;
  }, [data]);

  return {
    filters,
    loading: isLoading,
    error: error ? "Unable to load filters" : null,
  };
}

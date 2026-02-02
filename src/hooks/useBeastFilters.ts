import { useState, useEffect } from "react";
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
 * Automatically filters out traits that shouldn't be shown in the UI
 */
export function useBeastFilters(): UseBeastFiltersResult {
  const [filters, setFilters] = useState<BeastAttributeFilters>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const loadFilters = async () => {
      try {
        setLoading(true);
        setError(null);

        const fetchedFilters = await fetchBeastAttributeFilters();
        if (cancelled) return;

        // Remove hidden traits from filter options
        const cleanedEntries = (
          Array.isArray(Object.entries(fetchedFilters))
            ? (Object.entries(fetchedFilters) as Array<[string, string[]]>)
            : []
        ).filter(([trait]) => !HIDDEN_FILTER_TRAITS.has(trait.toLowerCase()));

        const cleaned = Object.fromEntries(
          cleanedEntries
        ) as BeastAttributeFilters;

        setFilters(cleaned);
      } catch (err) {
        if (!cancelled) {
          setError("Unable to load filters");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    loadFilters();
    return () => {
      cancelled = true;
    };
  }, []);

  return {
    filters,
    loading,
    error,
  };
}

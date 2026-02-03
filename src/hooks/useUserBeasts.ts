import { useState, useEffect, useCallback } from "react";
import type { Beast } from "../services/beast";
import { fetchBeasts } from "../services/beast";

export interface UseUserBeastsOptions {
  /** Whether to automatically load beasts when address changes */
  autoLoad?: boolean;
}

export interface UseUserBeastsResult {
  beasts: Beast[];
  loading: boolean;
  /** Whether beasts have been loaded at least once (true after first successful load) */
  hasLoaded: boolean;
  error: string | null;
  reload: () => Promise<void>;
}

/**
 * Hook for fetching and managing a user's beasts
 * Handles pagination automatically for large collections
 */
export function useUserBeasts(
  address: string | undefined,
  options: UseUserBeastsOptions = {}
): UseUserBeastsResult {
  const { autoLoad = true } = options;

  const [beasts, setBeasts] = useState<Beast[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadBeasts = useCallback(async () => {
    if (!address) {
      setBeasts([]);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const limit = 100; // Smaller batches for faster first paint
      let page = 1;
      let results: Beast[] = [];
      let total = Infinity;

      // Paginate through all beasts - update UI after each page for progressive loading
      while (results.length < total) {
        const { beasts: fetchedBeasts, total: totalCount } = await fetchBeasts({
          limit,
          ownerAddresses: [address],
          page,
          sort: "default",
        });

        results = results.concat(fetchedBeasts);
        total = typeof totalCount === "number" ? totalCount : results.length;

        // Update UI progressively after each page
        setBeasts([...results]);

        if (fetchedBeasts.length < limit) {
          break;
        }

        // Small delay between pagination requests to avoid burst loading
        if (results.length < total) {
          await new Promise((resolve) => setTimeout(resolve, 100));
        }

        page += 1;
      }
      // Mark as loaded after successful completion
      setHasLoaded(true);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "Failed to load beasts";

      // Provide user-friendly error messages for common issues
      if (errorMsg.includes("502") || errorMsg.includes("can't reach deployment")) {
        setError(
          "Indexer service is temporarily unavailable. Your beasts are safe on-chain, but can't be displayed right now. Please try again in a few minutes."
        );
      } else {
        setError("Failed to load beasts. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  }, [address]);

  // Auto-load beasts when address changes
  useEffect(() => {
    if (autoLoad) {
      loadBeasts();
    }
  }, [autoLoad, loadBeasts]);

  return {
    beasts,
    loading,
    hasLoaded,
    error,
    reload: loadBeasts,
  };
}

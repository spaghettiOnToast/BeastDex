// src/hooks/useBeasts.ts
import { useEffect, useState, useCallback, useMemo } from "react";
import {
  fetchBeasts,
  type AttributeFilterInput,
  type Beast,
  type BeastSortField,
} from "../services/beast";
import { getUserFriendlyErrorMessage } from "../utils/error";

type UseBeastsOptions = {
  limit?: number;
  search?: string;
  attributeFilters?: AttributeFilterInput;
  ownerAddresses?: string[];
  page?: number;
  sort?: BeastSortField;
  enabled?: boolean;
};

export function useBeasts({
  limit = 20,
  search = "",
  attributeFilters: attributeFiltersArg,
  ownerAddresses: ownerAddressesArg,
  page = 1,
  sort = "default",
  enabled = true,
}: UseBeastsOptions = {}) {
  // Key reloads on the *contents* of these arguments: callers often pass fresh
  // arrays/objects (or nothing, i.e. a new default) every render, which used to
  // re-run the fetch in a loop (flickering paging, nonstop API calls).
  const filtersKey = JSON.stringify(attributeFiltersArg ?? {});
  const ownersKey = JSON.stringify(ownerAddressesArg ?? []);
  const attributeFilters = useMemo(() => JSON.parse(filtersKey) as AttributeFilterInput, [filtersKey]);
  const ownerAddresses = useMemo(() => JSON.parse(ownersKey) as string[], [ownersKey]);

  const [beasts, setBeasts] = useState<Beast[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [total, setTotal] = useState(0);

  const load = useCallback(
    async (signal?: AbortSignal) => {
      if (!enabled) {
        setBeasts([]);
        setTotal(0);
        setError(null);
        setLoading(false);
        return;
      }
      try {
        setLoading(true);
        setError(null);

        const { beasts: result, total: totalCount } = await fetchBeasts({
          limit,
          search,
          attributeFilters,
          ownerAddresses,
          page,
          sort,
        });
        if (signal?.aborted) return;

        setBeasts(result);
        setTotal(totalCount);
      } catch (error: unknown) {
        if (signal?.aborted) return;
        console.error("Failed to fetch beasts:", error);
        setError(getUserFriendlyErrorMessage(error, "Failed to fetch beasts"));
      } finally {
        if (!signal?.aborted) {
          setLoading(false);
        }
      }
    },
    [attributeFilters, enabled, limit, ownerAddresses, page, search, sort]
  );

  useEffect(() => {
    const controller = new AbortController();
    if (enabled) {
      load(controller.signal);
    } else {
      setBeasts([]);
      setTotal(0);
      setLoading(false);
      setError(null);
    }
    return () => controller.abort();
  }, [enabled, load]);

  // More accurate hasMore calculation - if we got a full page, there might be more
  const hasMore = total > page * limit;

  return { beasts, total, hasMore, loading, error, reload: load };
}

// src/hooks/useBeasts.ts
import { useEffect, useState, useCallback } from "react";
import {
  fetchBeasts,
  type AttributeFilterInput,
  type Beast,
} from "../services/beast";
import { getErrorMessage } from "../utils/error";

type UseBeastsOptions = {
  limit?: number;
  search?: string;
  attributeFilters?: AttributeFilterInput;
  ownerAddresses?: string[];
  page?: number;
  sort?: "default" | "beast";
  enabled?: boolean;
};

export function useBeasts({
  limit = 20,
  search = "",
  attributeFilters = {},
  ownerAddresses = [],
  page = 1,
  sort = "default",
  enabled = true,
}: UseBeastsOptions = {}) {
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
        console.log(
          `🔎 Fetching beasts from ${
            import.meta.env.DEV ? "proxy (/torii → Cartridge)" : "Cartridge API"
          }`
        );

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
        console.log(`✅ Finished loading beasts (page size: ${result.length}, total: ${totalCount})`);
      } catch (error: unknown) {
        if (signal?.aborted) return;
        console.error("❌ Failed to fetch beasts:", error);
        setError(getErrorMessage(error, "Failed to fetch beasts"));
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

  const hasMore = total > page * limit;

  return { beasts, total, hasMore, loading, error, reload: load };
}

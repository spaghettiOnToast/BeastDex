import { useCallback, useMemo } from "react";
import { useQueries } from "@tanstack/react-query";
import {
  FESTIVAL_COLLECTIONS,
  festivalCollectionFor,
  fetchFestivalTokens,
  ownedFestivalTokenIds,
  toFestivalListingToken,
  type FestivalToken,
} from "../services/festivalBeasts";
import type { FestivalListingToken } from "../services/marketplace/types";
import { marketplaceTokenKey } from "../services/marketplace/constants";

/**
 * Tokens (metadata + owner) of every festival collection, for showing them in
 * the marketplace next to Beasts. Supplies are tiny, so all are loaded.
 */
export function useFestivalTokens(enabled = true) {
  const results = useQueries({
    queries: FESTIVAL_COLLECTIONS.map((c) => ({
      queryKey: ["festivalTokens", c.address],
      enabled,
      queryFn: () => fetchFestivalTokens(c),
      staleTime: 60_000,
    })),
  });

  const data = results.map((r) => r.data);
  const byKey = useMemo(() => {
    const map = new Map<string, FestivalListingToken>();
    FESTIVAL_COLLECTIONS.forEach((c, i) => {
      for (const t of data[i] ?? []) map.set(marketplaceTokenKey(c.address, t.tokenId), toFestivalListingToken(c, t));
    });
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `data` entries are stable query results
  }, data);

  const tokensByCollection = useMemo(
    () => FESTIVAL_COLLECTIONS.map((c, i) => ({ collection: c, tokens: (data[i] ?? []) as FestivalToken[] })),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `data` entries are stable query results
    data,
  );

  /** Festival display record for a (collection, tokenId), or null for Beasts / unknown tokens. */
  const getFestival = useCallback(
    (collection: string | null | undefined, tokenId: string | number | bigint): FestivalListingToken | null =>
      festivalCollectionFor(collection) ? byKey.get(marketplaceTokenKey(collection, tokenId)) ?? null : null,
    [byKey],
  );

  /** Collection-qualified keys of festival tokens held by `owner`. */
  const ownedKeys = useCallback(
    (owner: string | null | undefined): string[] =>
      tokensByCollection.flatMap(({ collection, tokens }) =>
        Array.from(ownedFestivalTokenIds(tokens, owner), (id) => marketplaceTokenKey(collection.address, id)),
      ),
    [tokensByCollection],
  );

  return { getFestival, ownedKeys, tokensByCollection, isLoading: results.some((r) => r.isLoading) };
}

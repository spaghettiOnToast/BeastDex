import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { Beast } from "../../../services/beast";
import { BEASTS_COLLECTION_ADDRESS, getMarketplaceCollection } from "../../../services/marketplace/constants";
import type { FestivalListingToken } from "../../../services/marketplace/types";
import { fetchFestivalTokens, getFestivalCollection, toFestivalListingToken } from "../../../services/festivalBeasts";
import { useArcadeSalesForCollection, type ArcadeSaleCompat } from "../../../hooks/useArcadeOrders";
import { useBeastLookup } from "../../../hooks/useBeastLookup";

export interface RecentSaleWithBeast {
  sale: ArcadeSaleCompat;
  beast: Beast | null;
  /** festival collections: token metadata instead of a beast */
  festival?: FestivalListingToken | null;
  tokenId: string;
  price: string;
  currency: string;
  from: string;
  to: string;
  time: number;
}

interface UseRecentSalesProps {
  listings: Array<{ tokenId: string; beast?: Beast | null }>;
  limit?: number;
  page?: number;
  pageSize?: number;
  /** collection to show sales for (defaults to Beasts) */
  collection?: string;
}

/**
 * Hook for fetching recent sales from the marketplace indexer via GraphQL.
 * Only hydrates beast metadata for the current page to avoid unnecessary fetches.
 */
export function useRecentSales({
  listings,
  limit = 20,
  page = 1,
  pageSize = 100,
  collection = BEASTS_COLLECTION_ADDRESS,
}: UseRecentSalesProps) {
  // Fetch sales via GraphQL
  const { data: sales = [], isLoading, refetch: refetchSales, invalidateAndRefetch } = useArcadeSalesForCollection(
    collection,
    limit
  );

  // Only collect token IDs for the current page to limit beast metadata fetches
  const { pageTokenIds, totalPages, totalItems } = useMemo(() => {
    const startIdx = (page - 1) * pageSize;
    const pageSales = sales.slice(startIdx, startIdx + pageSize);
    return {
      pageTokenIds: pageSales.map(sale => sale.order.tokenId.toString()),
      totalPages: Math.ceil(sales.length / pageSize),
      totalItems: sales.length,
    };
  }, [sales, page, pageSize]);

  // Festival collections have no Beast records: hydrate from chain metadata.
  const festivalCollection = getFestivalCollection(getMarketplaceCollection(collection)?.festivalSlug);
  const { data: festivalTokens } = useQuery({
    queryKey: ["festivalTokens", festivalCollection?.address],
    enabled: !!festivalCollection,
    queryFn: () => fetchFestivalTokens(festivalCollection!),
    staleTime: 5 * 60_000,
  });
  const festivalById = useMemo(
    () => new Map((festivalTokens ?? []).map((t) => [String(t.tokenId), t])),
    [festivalTokens],
  );

  // Use shared beast lookup hook — only fetches beasts for the current page
  const { getBeast } = useBeastLookup(
    festivalCollection ? [] : listings,
    festivalCollection ? [] : pageTokenIds,
  );

  // Transform ALL sales but only attach beast data for hydrated tokens
  const recentSales = useMemo((): RecentSaleWithBeast[] => {
    return sales.map(sale => {
      const tokenId = sale.order.tokenId.toString();
      const ft = festivalCollection ? festivalById.get(tokenId) : undefined;
      const festival: FestivalListingToken | null =
        ft && festivalCollection ? toFestivalListingToken(festivalCollection, ft) : null;
      return {
        sale,
        beast: festivalCollection ? null : getBeast(tokenId) ?? null,
        festival,
        tokenId,
        price: sale.order.price.toString(),
        currency: sale.order.currency,
        from: sale.from,
        to: sale.to,
        time: sale.time,
      };
    });
  }, [sales, getBeast, festivalCollection, festivalById]);

  return {
    recentSales,
    namedRecentSales: recentSales,
    isLoading,
    refetchSales,
    invalidateAndRefetch,
    totalPages,
    totalItems,
  };
}

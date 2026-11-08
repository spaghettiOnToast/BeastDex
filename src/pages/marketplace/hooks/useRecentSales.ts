import { useMemo } from "react";
import type { Beast } from "../../../services/beast";
import { MARKETPLACE_COLLECTION_ADDRESSES } from "../../../services/marketplace/constants";
import type { FestivalListingToken } from "../../../services/marketplace/types";
import { festivalCollectionFor } from "../../../services/festivalBeasts";
import { useFestivalTokens } from "../../../hooks/useFestivalTokens";
import { useArcadeSalesForCollection, type CollectionArg, type ArcadeSaleCompat } from "../../../hooks/useArcadeOrders";
import { useBeastLookup } from "../../../hooks/useBeastLookup";

export interface RecentSaleWithBeast {
  sale: ArcadeSaleCompat;
  beast: Beast | null;
  /** festival tokens: token metadata instead of a beast */
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
  /** collection(s) to show sales for (defaults to all marketplace collections) */
  collection?: CollectionArg;
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
  collection = MARKETPLACE_COLLECTION_ADDRESSES,
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
      // Festival tokens are hydrated separately (no Beast records)
      pageTokenIds: pageSales
        .filter(sale => !festivalCollectionFor(sale.order.collection))
        .map(sale => sale.order.tokenId.toString()),
      totalPages: Math.ceil(sales.length / pageSize),
      totalItems: sales.length,
    };
  }, [sales, page, pageSize]);

  // Festival tokens have no Beast records: hydrate from chain metadata.
  const { getFestival } = useFestivalTokens();

  // Use shared beast lookup hook — only fetches beasts for the current page
  const { getBeast } = useBeastLookup(listings, pageTokenIds);

  // Transform ALL sales but only attach beast data for hydrated tokens
  const recentSales = useMemo((): RecentSaleWithBeast[] => {
    return sales.map(sale => {
      const tokenId = sale.order.tokenId.toString();
      const isFestival = Boolean(festivalCollectionFor(sale.order.collection));
      const festival: FestivalListingToken | null = isFestival ? getFestival(sale.order.collection, tokenId) : null;
      return {
        sale,
        beast: isFestival ? null : getBeast(tokenId) ?? null,
        festival,
        tokenId,
        price: sale.order.price.toString(),
        currency: sale.order.currency,
        from: sale.from,
        to: sale.to,
        time: sale.time,
      };
    });
  }, [sales, getBeast, getFestival]);

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

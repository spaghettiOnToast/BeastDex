import { useMemo } from "react";
import type { Beast } from "../../../services/beast";
import { BEASTS_COLLECTION_ADDRESS } from "../../../services/marketplace/constants";
import { useArcadeSalesForCollection, type ArcadeSaleCompat } from "../../../hooks/useArcadeOrders";
import { useBeastLookup } from "../../../hooks/useBeastLookup";

export interface RecentSaleWithBeast {
  sale: ArcadeSaleCompat;
  beast: Beast | null;
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
}

/**
 * Hook for fetching recent sales from the marketplace indexer via GraphQL.
 * Only hydrates beast metadata for the current page to avoid unnecessary fetches.
 */
export function useRecentSales({ listings, limit = 20, page = 1, pageSize = 100 }: UseRecentSalesProps) {
  // Fetch sales via GraphQL
  const { data: sales = [], isLoading, refetch: refetchSales, invalidateAndRefetch } = useArcadeSalesForCollection(
    BEASTS_COLLECTION_ADDRESS,
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

  // Use shared beast lookup hook — only fetches beasts for the current page
  const { getBeast } = useBeastLookup(listings, pageTokenIds);

  // Transform ALL sales but only attach beast data for hydrated tokens
  const recentSales = useMemo((): RecentSaleWithBeast[] => {
    return sales.map(sale => {
      const tokenId = sale.order.tokenId.toString();
      return {
        sale,
        beast: getBeast(tokenId) ?? null,
        tokenId,
        price: sale.order.price.toString(),
        currency: sale.order.currency,
        from: sale.from,
        to: sale.to,
        time: sale.time,
      };
    });
  }, [sales, getBeast]);

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

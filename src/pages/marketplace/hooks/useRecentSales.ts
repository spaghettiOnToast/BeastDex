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
}

/**
 * Hook for fetching recent sales from the marketplace indexer via GraphQL
 */
export function useRecentSales({ listings, limit = 20 }: UseRecentSalesProps) {
  // Fetch sales via GraphQL
  const { data: sales = [], isLoading, refetch: refetchSales, invalidateAndRefetch } = useArcadeSalesForCollection(
    BEASTS_COLLECTION_ADDRESS,
    limit
  );

  // Collect token IDs from sales for beast lookup
  const saleTokenIds = useMemo(
    () => sales.map(sale => sale.order.tokenId.toString()),
    [sales]
  );

  // Use shared beast lookup hook
  const { getBeast } = useBeastLookup(listings, saleTokenIds);

  // Transform sales into RecentSaleWithBeast with beast data
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
  };
}

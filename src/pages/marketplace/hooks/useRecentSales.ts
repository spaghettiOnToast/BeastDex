import { useMemo } from "react";
import type { Beast } from "../../../services/beast";
import { useMarketplace, type SaleEvent } from "@cartridge/marketplace";
import { BEASTS_COLLECTION_ADDRESS } from "../../../services/marketplace/constants";

/**
 * Normalize a Starknet address to a consistent format for comparison
 */
function normalizeAddress(address: string): string {
  if (!address) return '';
  const cleaned = address.toLowerCase().replace(/^0x/i, '').replace(/^0+/, '');
  return '0x' + (cleaned || '0');
}

/**
 * Check if two Starknet addresses are equal
 */
function addressesEqual(a: string, b: string): boolean {
  return normalizeAddress(a) === normalizeAddress(b);
}

export interface RecentSaleWithBeast {
  sale: SaleEvent;
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
 * Hook for fetching recent sales from the marketplace indexer
 * Replaces the manual loading logic with direct SDK data access
 */
export function useRecentSales({ listings, limit = 20 }: UseRecentSalesProps) {
  const marketplace = useMarketplace();

  // Create a map of tokenId -> beast for quick lookup
  const beastMap = useMemo(() => {
    const map = new Map<string, Beast | null>();
    for (const listing of listings) {
      if (listing.beast) {
        map.set(listing.tokenId, listing.beast);
      }
    }
    return map;
  }, [listings]);

  // Get recent sales from marketplace context
  const recentSales = useMemo((): RecentSaleWithBeast[] => {
    if (!marketplace.sales) return [];

    const sales: RecentSaleWithBeast[] = [];

    for (const sale of marketplace.sales as SaleEvent[]) {
      // Skip invalid sales
      if (!sale.exists?.() && sale.exists !== undefined) continue;

      const order = sale.order;
      if (!order) continue;

      // Only include sales for the beasts collection
      if (!addressesEqual(order.collection, BEASTS_COLLECTION_ADDRESS)) continue;

      const tokenId = order.tokenId?.toString() ?? '';
      const beast = beastMap.get(tokenId) ?? null;

      sales.push({
        sale,
        beast,
        tokenId,
        price: order.price?.toString() ?? '0',
        currency: order.currency ?? '',
        from: sale.from ?? '',
        to: sale.to ?? '',
        time: sale.time ?? 0,
      });
    }

    // Sort by time descending (most recent first) and limit
    return sales
      .sort((a, b) => b.time - a.time)
      .slice(0, limit);
  }, [marketplace.sales, beastMap, limit]);

  // Filter to only sales with named beasts (for display purposes)
  const namedRecentSales = useMemo(() => {
    return recentSales.filter(
      ({ beast }) => beast?.name && beast.name.trim().length > 0
    );
  }, [recentSales]);

  return {
    recentSales,
    namedRecentSales,
    isLoading: false, // Data comes from context which is already loaded
  };
}

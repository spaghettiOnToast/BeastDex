import { useCallback, useMemo } from "react";
import type { TxEntry } from "../types";
import type { Listing } from "../../../services/marketplace/types";
import { CategoryType } from "../../../services/marketplace/arcadeTypes";
import { MARKETPLACE_COLLECTION_ADDRESSES } from "../../../services/marketplace/constants";
import { festivalCollectionFor } from "../../../services/festivalBeasts";
import { useFestivalTokens } from "../../../hooks/useFestivalTokens";
import { compareStarknetAddresses, normaliseStarknetAddress } from "../../../utils/address";
import { useUserOffers, useUserSales, type ArcadeOrderModelCompat, type CollectionArg } from "../../../hooks/useArcadeOrders";
import { useBeastLookup } from "../../../hooks/useBeastLookup";

/**
 * Check if an offer is still active (not expired)
 */
function getOfferStatus(offer: ArcadeOrderModelCompat): "active" | "expired" {
  const now = Math.floor(Date.now() / 1000);
  return offer.expiration > now ? "active" : "expired";
}

interface UseUserTransactionsProps {
  address: string | undefined;
  listings: Listing[];
  /** collection(s) to show activity for (defaults to all marketplace collections) */
  collection?: CollectionArg;
}

/**
 * Hook for fetching user transaction history from the marketplace
 * Combines listings data, Arcade GraphQL offers, and Arcade GraphQL sales
 */
export function useUserTransactions({ address, listings, collection = MARKETPLACE_COLLECTION_ADDRESSES }: UseUserTransactionsProps) {
  const { data: userOffers, isLoading: offersLoading, refetch: refetchOffers } = useUserOffers(
    address,
    collection
  );

  const { data: userSales, isLoading: salesLoading, refetch: refetchSales, invalidateAndRefetch: invalidateSales } = useUserSales(
    address,
    collection
  );

  // Collect all token IDs from sales and offers for beast lookup
  const additionalTokenIds = useMemo(() => {
    const ids: string[] = [];
    // Festival tokens have no Beast records (named via useFestivalTokens)
    userSales?.forEach(sale => {
      if (!festivalCollectionFor(sale.order.collection)) ids.push(String(sale.order.tokenId));
    });
    userOffers?.forEach(offer => {
      if (!festivalCollectionFor(offer.collection)) ids.push(String(offer.tokenId));
    });
    return ids;
  }, [userSales, userOffers]);

  // Use shared beast lookup hook
  const { getBeast } = useBeastLookup(listings, additionalTokenIds);
  const { getFestival } = useFestivalTokens();
  const nameFor = useCallback(
    (collection: string | null | undefined, tokenId: string) =>
      festivalCollectionFor(collection) ? getFestival(collection, tokenId)?.name : getBeast(tokenId)?.name,
    [getBeast, getFestival]
  );

  // Build user transactions
  const transactions = useMemo((): TxEntry[] => {
    if (!address) return [];

    const result: TxEntry[] = [];
    const normalizedUserAddress = normaliseStarknetAddress(address);

    // Add user's listings (both active and cancelled)
    for (const listing of listings) {
      if (compareStarknetAddresses(listing.seller, normalizedUserAddress)) {
        const type = listing.status === 'cancelled' ? 'cancel' : 'list';
        result.push({
          type,
          tokenId: listing.tokenId,
          beastName: listing.beast?.name ?? listing.festival?.name,
          price: listing.price,
          paymentToken: listing.paymentToken ?? undefined,
          expiration: listing.expiration,
          timestamp: listing.createdAt ? listing.createdAt * 1000 : 0,
          orderId: listing.orderId, // For secondary sort when timestamp is 0
          status: listing.status,
        });
      }
    }

    // Add user's offers
    userOffers?.forEach(offer => {
      const tokenId = String(offer.tokenId);
      result.push({
        type: "offer",
        tokenId,
        beastName: nameFor(offer.collection, tokenId),
        price: String(offer.price),
        paymentToken: offer.currency,
        expiration: offer.expiration,
        // Use createdAt from arcadeOfferModels if available, otherwise fallback to orderId
        timestamp: offer.createdAt ? offer.createdAt * 1000 : 0,
        orderId: offer.id, // Fallback for secondary sort if timestamp is 0
        status: getOfferStatus(offer),
      });
    });

    // Add user's sales (where user is buyer or seller)
    userSales?.forEach(sale => {
      const tokenId = String(sale.order.tokenId);
      const beastName = nameFor(sale.order.collection, tokenId);
      const isSeller = compareStarknetAddresses(sale.from, normalizedUserAddress);
      const isBuyer = compareStarknetAddresses(sale.to, normalizedUserAddress);
      const wasOffer = sale.order.category.value === CategoryType.Buy;

      if (isSeller) {
        result.push({
          type: wasOffer ? "offer-accepted" : "sold",
          tokenId,
          beastName,
          price: String(sale.order.price),
          paymentToken: sale.order.currency,
          timestamp: sale.time * 1000,
          status: "completed",
        });
      }

      if (isBuyer) {
        result.push({
          type: "buy",
          tokenId,
          beastName,
          price: String(sale.order.price),
          paymentToken: sale.order.currency,
          timestamp: sale.time * 1000,
          status: "completed",
        });
      }
    });

    // Sort by recency: timestamp descending, with orderId as tiebreaker for stable sort
    result.sort((a, b) => {
      // Both have timestamps - sort by timestamp descending
      if (a.timestamp !== 0 && b.timestamp !== 0) {
        const timeDiff = b.timestamp - a.timestamp;
        // If timestamps are equal, use orderId as tiebreaker for stable sort
        if (timeDiff === 0) {
          return (b.orderId ?? 0) - (a.orderId ?? 0);
        }
        return timeDiff;
      }
      // Both have no timestamp - use orderId as proxy (higher = more recent)
      if (a.timestamp === 0 && b.timestamp === 0) {
        return (b.orderId ?? 0) - (a.orderId ?? 0);
      }
      // One has timestamp, one doesn't - timestamp wins
      if (a.timestamp === 0) return 1;
      return -1;
    });

    return result;
  }, [address, listings, userOffers, userSales, nameFor]);

  return {
    transactions,
    isLoading: offersLoading || salesLoading,
    refetchOffers,
    refetchSales,
    invalidateSales,
  };
}

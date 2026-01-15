import { useMemo } from "react";
import type { TxEntry } from "../types";
import type { Beast } from "../../../services/beast";
import { useMarketplace, type ListingEvent, type OfferEvent, type SaleEvent } from "@cartridge/marketplace";
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

/**
 * Extract transaction hash from event identifier
 * The identifier format may be the tx hash directly or contain it
 */
function extractTxHash(identifier: string | undefined): string | undefined {
  if (!identifier) return undefined;

  // If the identifier looks like a hex string (0x...), it might be the tx hash
  if (identifier.startsWith('0x')) {
    // Could be just the tx hash or format like "0x{txHash}_{index}"
    const parts = identifier.split('_');
    const potentialHash = parts[0];
    // Starknet tx hashes are typically 64 hex chars (+ 0x prefix = 66 chars)
    if (potentialHash.length >= 64) {
      return potentialHash;
    }
  }

  // Return the identifier as-is if it looks like a valid hash
  if (identifier.length >= 64) {
    return identifier.startsWith('0x') ? identifier : `0x${identifier}`;
  }

  return undefined;
}

interface UseUserTransactionsProps {
  address: string | undefined;
  listings: Array<{ tokenId: string; beast?: Beast | null }>;
}

/**
 * Hook for fetching user transaction history from the marketplace indexer
 * Replaces localStorage-based transaction tracking with indexer data
 */
export function useUserTransactions({ address, listings }: UseUserTransactionsProps) {
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

  // Get user's transactions from marketplace context
  const userTransactions = useMemo((): TxEntry[] => {
    if (!address) return [];

    const transactions: TxEntry[] = [];
    const normalizedUserAddress = normalizeAddress(address);

    // Filter listings created by the user (for beasts collection only)
    if (marketplace.listings) {
      for (const listing of marketplace.listings as ListingEvent[]) {
        if (!listing.exists?.() && listing.exists !== undefined) continue;

        const order = listing.order;
        if (!order) continue;

        // Only include listings for the beasts collection
        if (!addressesEqual(order.collection, BEASTS_COLLECTION_ADDRESS)) continue;

        // Check if user owns this listing
        if (addressesEqual(order.owner, normalizedUserAddress)) {
          const tokenId = order.tokenId?.toString() ?? '';
          const beast = beastMap.get(tokenId);
          // The identifier may contain the tx hash (format varies)
          const txHash = extractTxHash(listing.identifier);

          transactions.push({
            type: "list",
            tokenId,
            beastName: beast?.name,
            price: order.price?.toString(),
            paymentToken: order.currency,
            expiration: order.expiration,
            timestamp: listing.time * 1000, // Convert to milliseconds
            txHash,
          });
        }
      }
    }

    // Filter offers made by the user (for beasts collection only)
    if (marketplace.offers) {
      for (const offer of marketplace.offers as OfferEvent[]) {
        if (!offer.exists?.() && offer.exists !== undefined) continue;

        const order = offer.order;
        if (!order) continue;

        // Only include offers for the beasts collection
        if (!addressesEqual(order.collection, BEASTS_COLLECTION_ADDRESS)) continue;

        // Check if user made this offer
        if (addressesEqual(order.owner, normalizedUserAddress)) {
          const tokenId = order.tokenId?.toString() ?? '';
          const beast = beastMap.get(tokenId);
          const txHash = extractTxHash(offer.identifier);

          transactions.push({
            type: "offer",
            tokenId,
            beastName: beast?.name,
            price: order.price?.toString(),
            paymentToken: order.currency,
            expiration: order.expiration,
            timestamp: offer.time * 1000,
            txHash,
          });
        }
      }
    }

    // Filter sales involving the user (for beasts collection only)
    if (marketplace.sales) {
      for (const sale of marketplace.sales as SaleEvent[]) {
        if (!sale.exists?.() && sale.exists !== undefined) continue;

        const order = sale.order;
        if (!order) continue;

        // Only include sales for the beasts collection
        if (!addressesEqual(order.collection, BEASTS_COLLECTION_ADDRESS)) continue;

        const tokenId = order.tokenId?.toString() ?? '';
        const beast = beastMap.get(tokenId);
        const txHash = extractTxHash(sale.identifier);
        const isSeller = addressesEqual(sale.from, normalizedUserAddress);
        const isBuyer = addressesEqual(sale.to, normalizedUserAddress);

        if (isSeller) {
          transactions.push({
            type: "sell",
            tokenId,
            beastName: beast?.name,
            price: order.price?.toString(),
            paymentToken: order.currency,
            timestamp: sale.time * 1000,
            txHash,
            note: `Sold to ${sale.to.slice(0, 6)}...${sale.to.slice(-4)}`,
          });
        }

        if (isBuyer) {
          transactions.push({
            type: "buy",
            tokenId,
            beastName: beast?.name,
            price: order.price?.toString(),
            paymentToken: order.currency,
            timestamp: sale.time * 1000,
            txHash,
            note: `Bought from ${sale.from.slice(0, 6)}...${sale.from.slice(-4)}`,
          });
        }
      }
    }

    // Sort by timestamp descending (most recent first)
    transactions.sort((a, b) => b.timestamp - a.timestamp);

    return transactions;
  }, [address, marketplace.listings, marketplace.offers, marketplace.sales, beastMap]);

  return {
    transactions: userTransactions,
    isLoading: false, // Data comes from context which is already loaded
  };
}

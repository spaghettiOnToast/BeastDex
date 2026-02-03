/**
 * Single Query Marketplace Fetch
 *
 * Fetches listings WITH beast metadata in ONE query from pg-beasts.
 * This replaces:
 * 1. Arcade GraphQL for orders
 * 2. Multiple batched hydration queries
 *
 * pg-beasts now contains both Arcade order data and token metadata.
 */

import { runBeastSql } from "./sqlClient";
import { mapBeastRow, type BeastRow } from "./helpers";
import type { Listing } from "../marketplace/types";
import { BEASTS_COLLECTION_ADDRESS } from "../marketplace/constants";

const CONTRACT_ADDRESS = BEASTS_COLLECTION_ADDRESS.toLowerCase();

type ListingWithMetadataRow = {
  order_id: string;
  token_id: string;
  price: string;
  seller: string;
  expiration: string;
  currency: string;
  quantity: string;
  status: string;
  category: string;
  // From ARCADE-Listing table
  listing_time: string | null;
  // From tokens table
  id: string;
  metadata: string;
};

/**
 * Fetch all active listings with beast metadata in a single query
 */
export async function fetchListingsWithMetadataSingleQuery(): Promise<Listing[]> {
  // Single query joining ARCADE orders with listings (for timestamp) and tokens metadata
  // Note: Table names use quotes for case-sensitivity if needed
  // The token_id in ARCADE-Order is hex (e.g., '0x1234')
  // The tokens.id format is: contract:0x{64-char-padded-hex}
  // SQLite CAST doesn't handle hex strings, so we pad the hex directly
  const ZERO_PAD = '0'.repeat(64);
  const query = `
    SELECT
      o.id as order_id,
      o.token_id,
      o.price,
      o.owner as seller,
      o.expiration,
      o.currency,
      o.quantity,
      o.status,
      o.category,
      l.time as listing_time,
      t.id,
      t.metadata
    FROM "ARCADE-Order" o
    LEFT JOIN "ARCADE-Listing" l ON l.order_id = o.id
    LEFT JOIN tokens t
      ON t.contract_address = '${CONTRACT_ADDRESS}'
      AND t.id = '${CONTRACT_ADDRESS}:0x' || substr('${ZERO_PAD}' || lower(substr(o.token_id, 3)), -64, 64)
    WHERE o.collection = '${CONTRACT_ADDRESS}'
      AND o.status = 1
      AND o.category = 2
    ORDER BY o.id DESC
    LIMIT 1500;
  `;

  try {
    const startTime = performance.now();
    const rows = await runBeastSql<ListingWithMetadataRow[]>(
      query,
      "fetchListingsWithMetadataSingleQuery",
      { timeoutMs: 60_000 }
    );
    const elapsed = performance.now() - startTime;

    if (import.meta.env.DEV) {
      console.log(`[Single Query] Fetched ${rows.length} listings with metadata in ${elapsed.toFixed(0)}ms`);
    }

    const listings: Listing[] = [];
    const now = Math.floor(Date.now() / 1000);

    for (const row of rows) {
      // Parse token ID (may be hex)
      const tokenIdNum = row.token_id.startsWith("0x")
        ? parseInt(row.token_id, 16)
        : parseInt(row.token_id, 10);
      const tokenId = String(tokenIdNum);

      // Parse expiration
      const expiration = row.expiration.startsWith("0x")
        ? parseInt(row.expiration, 16)
        : parseInt(row.expiration, 10);

      // Parse price (keep as string for BigInt safety)
      const price = row.price.startsWith("0x")
        ? BigInt(row.price).toString()
        : row.price;

      const isExpired = expiration > 0 && expiration <= now;

      // Parse listing time (hex string to unix timestamp)
      let createdAt: number | undefined = undefined;
      if (row.listing_time) {
        createdAt = row.listing_time.startsWith("0x")
          ? parseInt(row.listing_time, 16)
          : parseInt(row.listing_time, 10);
        if (isNaN(createdAt) || createdAt === 0) {
          createdAt = undefined;
        }
      }

      // Parse beast metadata if available
      let beast = null;
      if (row.metadata) {
        try {
          // Use the existing mapBeastRow logic
          const beastRow: BeastRow = {
            id: row.id,
            metadata: row.metadata,
            account_address: row.seller,
            power: undefined,
            total_count: undefined,
          };
          beast = mapBeastRow(beastRow);
        } catch (e) {
          console.warn(`[Single Query] Failed to parse beast metadata for token ${tokenId}:`, e);
        }
      }

      listings.push({
        listingId: row.order_id,
        orderId: parseInt(row.order_id, 10),
        tokenId,
        seller: row.seller,
        price,
        paymentToken: row.currency,
        expiration,
        quantity: parseInt(row.quantity, 10) || 1,
        active: !isExpired,
        status: isExpired ? "expired" : "active",
        createdAt,
        beast,
      });
    }

    if (import.meta.env.DEV) {
      const withBeast = listings.filter(l => l.beast).length;
      console.log(`[Single Query] Parsed ${listings.length} listings, ${withBeast} with beast metadata`);
    }

    return listings;
  } catch (error) {
    console.error("[Single Query] Failed:", error);
    throw error;
  }
}

/**
 * Marketplace Fetch
 *
 * Fetches active listings from ARCADE-Order/ARCADE-Listing tables in torii.
 * Beast metadata is hydrated separately via useBeastLookup (SDK).
 */

import { runBeastSql } from "./sqlClient";
import type { Listing } from "../marketplace/types";
import { BEASTS_COLLECTION_ADDRESS } from "../marketplace/constants";

const CONTRACT_ADDRESS = BEASTS_COLLECTION_ADDRESS.toLowerCase();

type ListingRow = {
  order_id: string;
  token_id: string;
  price: string;
  seller: string;
  expiration: string;
  currency: string;
  quantity: string;
  status: string;
  category: string;
  listing_time: string | null;
};

export async function fetchListingsWithMetadataSingleQuery(): Promise<Listing[]> {
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
      l.time as listing_time
    FROM "ARCADE-Order" o
    LEFT JOIN "ARCADE-Listing" l ON l.order_id = o.id
    WHERE o.collection = '${CONTRACT_ADDRESS}'
      AND o.status = 1
      AND o.category = 2
    ORDER BY o.id DESC
    LIMIT 1500;
  `;

  try {
    const rows = await runBeastSql<ListingRow[]>(
      query,
      "fetchListingsWithMetadataSingleQuery",
      { timeoutMs: 60_000 }
    );

    const now = Math.floor(Date.now() / 1000);
    const listings: Listing[] = [];

    for (const row of rows) {
      const tokenIdNum = row.token_id.startsWith("0x")
        ? parseInt(row.token_id, 16)
        : parseInt(row.token_id, 10);
      const tokenId = String(tokenIdNum);

      const expiration = row.expiration.startsWith("0x")
        ? parseInt(row.expiration, 16)
        : parseInt(row.expiration, 10);

      const price = row.price.startsWith("0x")
        ? BigInt(row.price).toString()
        : row.price;

      const isExpired = expiration > 0 && expiration <= now;

      let createdAt: number | undefined;
      if (row.listing_time) {
        const t = row.listing_time.startsWith("0x")
          ? parseInt(row.listing_time, 16)
          : parseInt(row.listing_time, 10);
        if (!isNaN(t) && t > 0) createdAt = t;
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
        beast: null,
      });
    }

    return listings;
  } catch (error) {
    console.error("[Marketplace] Failed:", error);
    throw error;
  }
}

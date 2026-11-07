/**
 * Marketplace Fetch
 *
 * Fetches active listings from ARCADE-Order/ARCADE-Listing tables in torii.
 * Beast metadata is hydrated separately via useBeastLookup (SDK).
 */

import { runBeastSql } from "./sqlClient";
import type { Listing } from "../marketplace/types";
import { BEASTS_COLLECTION_ADDRESS, paddedAddress } from "../marketplace/constants";
import { toTokenIdString } from "../../utils/tokenId";

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

/** Active listings (Sell orders) for one collection; defaults to Beasts. */
export async function fetchListingsWithMetadataSingleQuery(
  collectionAddress: string = BEASTS_COLLECTION_ADDRESS,
): Promise<Listing[]> {
  // Torii stores felts as lowercase 0x + 64 hex; BigInt-normalise to avoid SQL injection too.
  const collection = paddedAddress(collectionAddress);
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
    WHERE o.collection = '${collection}'
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
      // BigInt-safe: v3 token ids are 251-bit.
      const tokenId = toTokenIdString(row.token_id);
      if (!tokenId) continue;

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
        collection,
      });
    }

    return listings;
  } catch (error) {
    console.error("[Marketplace] Failed:", error);
    throw error;
  }
}

/**
 * Marketplace Service
 *
 * NOTE: Beast hydration has been moved to a single-query approach.
 * See src/services/beast/marketplaceQuery.ts for the implementation.
 *
 * This file previously contained:
 * - hydrateOrders (batched hydration)
 * - hydrateOrdersProgressive (progressive hydration)
 * - hydrateOrdersSingleQuery (optimized hydration)
 *
 * All replaced by fetchListingsWithMetadataSingleQuery which joins
 * ARCADE-Order with tokens metadata in a single SQL query.
 */

// Re-export types for convenience
export type { Listing, ListingStatus } from "./types";

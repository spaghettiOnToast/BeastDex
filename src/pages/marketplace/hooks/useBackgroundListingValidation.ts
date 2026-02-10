import { useEffect, useRef, useCallback } from "react";
import type { AccountInterface } from "starknet";
import type { Listing } from "../../../services/marketplace/types";
import { getOrderValidities, getProvider } from "../../../services/marketplace/approvals";
import { batchCheckOrderStatuses } from "../../../services/marketplace/arcadeSqlClient";
import { BEASTS_COLLECTION_ADDRESS } from "../../../services/marketplace/constants";

// How often to run a validation cycle (in ms)
const VALIDATION_INTERVAL = 2 * 60 * 1000; // 2 minutes

// How long a validation result is considered fresh (in ms)
const STALE_THRESHOLD = 5 * 60 * 1000; // 5 minutes

interface UseBackgroundListingValidationProps {
  account: AccountInterface | undefined;
  listings: Listing[];
  isLoading: boolean;
  isSold: (listingId: string) => boolean;
  markAsSold: (listingId: string) => void;
}

/**
 * Hook that validates listings in the background using SQL status checks
 * and contract-level get_validities calls, then marks invalid listings as sold.
 *
 * Uses incremental time-based revalidation: only re-checks listings whose
 * last validation is older than STALE_THRESHOLD.
 */
export function useBackgroundListingValidation({
  account,
  listings,
  isLoading,
  isSold,
  markAsSold,
}: UseBackgroundListingValidationProps): void {
  // Map of listingId -> timestamp of last successful validation
  const validatedRef = useRef<Map<string, number>>(new Map());
  const isValidatingRef = useRef(false);

  const validateListingsInBackground = useCallback(async () => {
    if (!account || listings.length === 0 || isLoading) return;
    if (isValidatingRef.current) return; // Prevent concurrent runs

    const provider = getProvider(account);
    const now = Date.now();

    // Clean up entries for listings no longer in the data
    const currentListingIds = new Set(listings.map((l) => l.listingId));
    for (const key of validatedRef.current.keys()) {
      if (!currentListingIds.has(key)) {
        validatedRef.current.delete(key);
      }
    }

    // Get listings that are stale or haven't been validated yet
    const toValidate = listings.filter((l) => {
      if (isSold(l.listingId)) return false;
      const lastValidated = validatedRef.current.get(l.listingId);
      return !lastValidated || now - lastValidated > STALE_THRESHOLD;
    });

    if (toValidate.length === 0) return;

    isValidatingRef.current = true;
    console.log(`[BackgroundValidation] Validating ${toValidate.length} listings (${listings.length} total)...`);

    let invalidCount = 0;
    let statusInvalidCount = 0;
    let contractInvalidCount = 0;

    try {
      // STEP 1: Fast batch check of order statuses via arcade-main
      // This catches cancelled/executed orders that pg-beasts hasn't synced yet
      const orderIds = toValidate.map((l) => l.listingId);
      console.log(`[BackgroundValidation] Checking order statuses for ${orderIds.length} listings...`);

      const statusMap = await batchCheckOrderStatuses(orderIds);

      // Filter out listings with inactive order status
      const stillActiveListings: Listing[] = [];
      for (const listing of toValidate) {
        const isActive = statusMap.get(listing.listingId);
        if (isActive === false) {
          console.log(`[BackgroundValidation] Marking ${listing.listingId} as sold (order status inactive)`);
          markAsSold(listing.listingId);
          invalidCount++;
          statusInvalidCount++;
        } else {
          stillActiveListings.push(listing);
        }
      }

      if (statusInvalidCount > 0) {
        console.log(`[BackgroundValidation] Found ${statusInvalidCount} inactive orders via SQL status check`);
      }

      // STEP 2: Contract validation using get_validities (authoritative)
      // This checks order status, ownership, expiration, etc.
      if (stillActiveListings.length > 0) {
        console.log(`[BackgroundValidation] Validating ${stillActiveListings.length} listings via contract...`);

        try {
          const ordersToValidate = stillActiveListings.map((listing) => ({
            orderId: listing.orderId ?? listing.listingId,
            collection: BEASTS_COLLECTION_ADDRESS,
            tokenId: BigInt(listing.tokenId),
          }));

          const validityResults = await getOrderValidities(provider, ordersToValidate);

          for (const listing of stillActiveListings) {
            const validity = validityResults.get(String(listing.orderId ?? listing.listingId));
            if (validity && !validity.valid) {
              console.log(`[BackgroundValidation] Marking ${listing.listingId} as sold (contract: ${validity.reason || "invalid"})`);
              markAsSold(listing.listingId);
              invalidCount++;
              contractInvalidCount++;
            } else {
              // Mark as freshly validated
              validatedRef.current.set(listing.listingId, now);
            }
          }

          if (contractInvalidCount > 0) {
            console.log(`[BackgroundValidation] Found ${contractInvalidCount} invalid orders via contract check`);
          }
        } catch (err) {
          console.warn(`[BackgroundValidation] Contract validation failed, will retry next cycle:`, err);
        }
      }

      // Mark Step 1-only validated listings as fresh too
      for (const listing of stillActiveListings) {
        if (!validatedRef.current.has(listing.listingId) || validatedRef.current.get(listing.listingId)! < now) {
          // Only set if not already set by Step 2 success
          if (!validatedRef.current.has(listing.listingId)) {
            validatedRef.current.set(listing.listingId, now);
          }
        }
      }

      if (invalidCount > 0) {
        console.log(`[BackgroundValidation] Completed. Found ${invalidCount} invalid listings (${statusInvalidCount} SQL status, ${contractInvalidCount} contract).`);
      }
    } finally {
      isValidatingRef.current = false;
    }
  }, [account, listings, isLoading, isSold, markAsSold]);

  // Run validation on initial load and when listings change
  useEffect(() => {
    validateListingsInBackground().catch((err) => {
      console.error("[BackgroundValidation] Error:", err);
    });
  }, [validateListingsInBackground]);

  // Set up periodic revalidation
  useEffect(() => {
    if (!account || isLoading) return;

    const intervalId = setInterval(() => {
      console.log("[BackgroundValidation] Running periodic revalidation...");
      validateListingsInBackground().catch((err) => {
        console.error("[BackgroundValidation] Periodic validation error:", err);
      });
    }, VALIDATION_INTERVAL);

    return () => clearInterval(intervalId);
  }, [account, isLoading, validateListingsInBackground]);
}

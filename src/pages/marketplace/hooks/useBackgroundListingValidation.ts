import { useEffect, useRef, useCallback } from "react";
import type { AccountInterface } from "starknet";
import type { Listing } from "../../../services/marketplace/types";
import { validateListingOwnership, getProvider } from "../../../services/marketplace/approvals";
import { BEASTS_COLLECTION_ADDRESS } from "../../../services/marketplace/constants";

// How often to re-validate all listings (in ms)
const VALIDATION_INTERVAL = 5 * 60 * 1000; // 5 minutes

interface UseBackgroundListingValidationProps {
  account: AccountInterface | undefined;
  listings: Listing[];
  isLoading: boolean;
  isSold: (listingId: string) => boolean;
  markAsSold: (listingId: string) => void;
}

/**
 * Hook that validates listing ownership in the background
 * and marks invalid listings as sold so they're filtered out.
 *
 * This runs automatically when listings load and then periodically
 * every 2 minutes to catch stale listings.
 */
export function useBackgroundListingValidation({
  account,
  listings,
  isLoading,
  isSold,
  markAsSold,
}: UseBackgroundListingValidationProps): void {
  const validatedRef = useRef<Set<string>>(new Set());
  const isValidatingRef = useRef(false);

  const validateListingsInBackground = useCallback(async (forceRevalidate = false) => {
    if (!account || listings.length === 0 || isLoading) return;
    if (isValidatingRef.current) return; // Prevent concurrent runs

    const provider = getProvider(account);
    const BATCH_SIZE = 10; // Validate 10 at a time to avoid overwhelming RPC
    const BATCH_DELAY = 500; // 500ms between batches

    // On periodic revalidation, clear the validated set to re-check everything
    if (forceRevalidate) {
      validatedRef.current.clear();
    }

    // Get listings that haven't been validated yet
    const toValidate = listings.filter(
      (l) => !isSold(l.listingId) && !validatedRef.current.has(l.listingId)
    );

    if (toValidate.length === 0) return;

    isValidatingRef.current = true;
    console.log(`[BackgroundValidation] Validating ${toValidate.length} listings...`);

    // Mark all as in-progress to avoid duplicate validation
    toValidate.forEach((l) => validatedRef.current.add(l.listingId));

    let invalidCount = 0;

    try {
      // Process in batches
      for (let i = 0; i < toValidate.length; i += BATCH_SIZE) {
        const batch = toValidate.slice(i, i + BATCH_SIZE);

        // Validate batch in parallel
        const results = await Promise.all(
          batch.map(async (listing) => {
            try {
              const isValid = await validateListingOwnership(
                provider,
                BEASTS_COLLECTION_ADDRESS,
                BigInt(listing.tokenId),
                listing.seller
              );
              return { listingId: listing.listingId, isValid };
            } catch (err) {
              // On error, assume valid (don't hide listing due to RPC issues)
              console.warn(`[BackgroundValidation] Error validating ${listing.listingId}:`, err);
              return { listingId: listing.listingId, isValid: true };
            }
          })
        );

        // Mark invalid listings as sold
        for (const result of results) {
          if (!result.isValid) {
            console.log(`[BackgroundValidation] Marking ${result.listingId} as sold (seller no longer owns)`);
            markAsSold(result.listingId);
            invalidCount++;
          }
        }

        // Small delay between batches to avoid rate limiting
        if (i + BATCH_SIZE < toValidate.length) {
          await new Promise((resolve) => setTimeout(resolve, BATCH_DELAY));
        }
      }

      if (invalidCount > 0) {
        console.log(`[BackgroundValidation] Completed. Found ${invalidCount} invalid listings.`);
      }
    } finally {
      isValidatingRef.current = false;
    }
  }, [account, listings, isLoading, isSold, markAsSold]);

  // Run validation on initial load and when listings change
  useEffect(() => {
    validateListingsInBackground(false).catch((err) => {
      console.error("[BackgroundValidation] Error:", err);
    });
  }, [validateListingsInBackground]);

  // Set up periodic revalidation
  useEffect(() => {
    if (!account || isLoading) return;

    const intervalId = setInterval(() => {
      console.log("[BackgroundValidation] Running periodic revalidation...");
      validateListingsInBackground(true).catch((err) => {
        console.error("[BackgroundValidation] Periodic validation error:", err);
      });
    }, VALIDATION_INTERVAL);

    return () => clearInterval(intervalId);
  }, [account, isLoading, validateListingsInBackground]);
}

import { useEffect, useRef } from "react";
import type { AccountInterface } from "starknet";
import type { Listing } from "../../../services/marketplace/types";
import { validateListingOwnership, getProvider } from "../../../services/marketplace/approvals";
import { BEASTS_COLLECTION_ADDRESS } from "../../../services/marketplace/constants";

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
 * This runs automatically when listings change and validates
 * ownership by checking ownerOf on the NFT contract.
 */
export function useBackgroundListingValidation({
  account,
  listings,
  isLoading,
  isSold,
  markAsSold,
}: UseBackgroundListingValidationProps): void {
  const validatedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!account || listings.length === 0 || isLoading) return;

    const validateListingsInBackground = async () => {
      const provider = getProvider(account);
      const BATCH_SIZE = 10; // Validate 10 at a time to avoid overwhelming RPC
      const BATCH_DELAY = 500; // 500ms between batches

      // Get listings that haven't been validated yet in this session
      const toValidate = listings.filter(
        (l) => !isSold(l.listingId) && !validatedRef.current.has(l.listingId)
      );

      if (toValidate.length === 0) return;

      console.log(`[BackgroundValidation] Validating ${toValidate.length} listings...`);

      // Mark all as in-progress to avoid duplicate validation
      toValidate.forEach((l) => validatedRef.current.add(l.listingId));

      let invalidCount = 0;

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
    };

    // Run validation in background (don't await - fire and forget)
    validateListingsInBackground().catch((err) => {
      console.error("[BackgroundValidation] Error:", err);
    });
  }, [account, listings, isLoading, isSold, markAsSold]);
}

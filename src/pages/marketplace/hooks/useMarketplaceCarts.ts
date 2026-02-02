import { useState, useCallback } from "react";
import type { Listing } from "../../../services/marketplace/types";
import { toast } from "sonner";

/**
 * Hook for managing cancel cart (for batch cancelling listings)
 * List cart and purchase cart are now handled by GlobalCartContext
 */
export function useMarketplaceCarts() {
  // Cancel cart state
  const [cancelCart, setCancelCart] = useState<Listing[]>([]);

  /**
   * Toggle a listing in the cancel cart
   */
  const handleToggleCancelCart = useCallback((listing: Listing) => {
    if (!listing.active) {
      toast.error("This listing is not active");
      return;
    }
    setCancelCart((prev) => {
      const inCart = prev.some((l) => l.listingId === listing.listingId);
      if (inCart) {
        return prev.filter((l) => l.listingId !== listing.listingId);
      }
      return [...prev, listing];
    });
  }, []);

  /**
   * Clear the cancel cart
   */
  const handleClearCancelCart = useCallback(() => {
    setCancelCart([]);
  }, []);

  /**
   * Add all active listings to the cancel cart
   */
  const handleAddAllToCancelCart = useCallback((listings: Listing[]) => {
    const activeListings = listings.filter((l) => l.active);
    setCancelCart(activeListings);
  }, []);

  /**
   * Check if a listing is in the cancel cart
   */
  const isInCancelCart = useCallback((listingId: string) => {
    return cancelCart.some((l) => l.listingId === listingId);
  }, [cancelCart]);

  return {
    cancelCart,
    handleToggleCancelCart,
    handleClearCancelCart,
    handleAddAllToCancelCart,
    isInCancelCart,
  };
}

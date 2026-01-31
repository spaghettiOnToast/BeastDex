import { useState, useCallback } from "react";
import type { Beast } from "../../../services/beast";
import type { Listing } from "../../../services/marketplace/types";
import { toast } from "sonner";

export interface UseMarketplaceCartsProps {
  alreadyListedTokenIds: Set<string>;
}

/**
 * Hook for managing marketplace carts (listing cart, purchase cart, and cancel cart)
 */
export function useMarketplaceCarts({ alreadyListedTokenIds }: UseMarketplaceCartsProps) {
  // Listing cart state
  const [cartBeasts, setCartBeasts] = useState<Beast[]>([]);
  const [beastPrices, setBeastPrices] = useState<Map<string, string>>(new Map());

  // Purchase cart state
  const [purchaseCart, setPurchaseCart] = useState<Listing[]>([]);

  // Cancel cart state
  const [cancelCart, setCancelCart] = useState<Listing[]>([]);

  /**
   * Toggle a beast in the listing cart
   */
  const handleToggleCart = useCallback((beast: Beast) => {
    // Check if beast is already listed
    const tokenId = beast.id.split(":").pop() || beast.id;
    if (alreadyListedTokenIds.has(tokenId)) {
      toast.error("This beast is already listed on the marketplace");
      return;
    }

    setCartBeasts((prev) => {
      // Check if already in cart
      const inCart = prev.some((b) => b.id === beast.id);
      if (inCart) {
        // Remove from cart
        return prev.filter((b) => b.id !== beast.id);
      }
      // Add to cart
      return [...prev, beast];
    });
  }, [alreadyListedTokenIds]);

  /**
   * Remove a beast from the listing cart
   */
  const handleRemoveFromCart = useCallback((beastId: string) => {
    setCartBeasts((prev) => prev.filter((b) => b.id !== beastId));
  }, []);

  /**
   * Clear the listing cart
   */
  const handleClearCart = useCallback(() => {
    setCartBeasts([]);
  }, []);

  /**
   * Update a beast's price in the listing cart
   */
  const handleUpdateBeastPrice = useCallback((beastId: string, price: string) => {
    setBeastPrices((prev) => {
      const newPrices = new Map(prev);
      newPrices.set(beastId, price);
      return newPrices;
    });
  }, []);

  /**
   * Toggle a listing in the purchase cart
   */
  const handleAddToPurchaseCart = useCallback((listing: Listing) => {
    setPurchaseCart((prev) => {
      // Check if already in cart
      const inCart = prev.some((l) => l.listingId === listing.listingId);
      if (inCart) {
        // Remove from cart
        return prev.filter((l) => l.listingId !== listing.listingId);
      }
      // Add to cart
      return [...prev, listing];
    });
  }, []);

  /**
   * Remove a listing from the purchase cart
   */
  const handleRemoveFromPurchaseCart = useCallback((listingId: string) => {
    setPurchaseCart((prev) => prev.filter((l) => l.listingId !== listingId));
  }, []);

  /**
   * Clear the purchase cart
   */
  const handleClearPurchaseCart = useCallback(() => {
    setPurchaseCart([]);
  }, []);

  /**
   * Check if a beast is in the listing cart
   */
  const isInCart = useCallback((beastId: string) => {
    return cartBeasts.some((b) => b.id === beastId);
  }, [cartBeasts]);

  /**
   * Check if a listing is in the purchase cart
   */
  const isInPurchaseCart = useCallback((listingId: string) => {
    return purchaseCart.some((l) => l.listingId === listingId);
  }, [purchaseCart]);

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
   * Remove a listing from the cancel cart
   */
  const handleRemoveFromCancelCart = useCallback((listingId: string) => {
    setCancelCart((prev) => prev.filter((l) => l.listingId !== listingId));
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
    // Listing cart
    cartBeasts,
    beastPrices,
    setCartBeasts,
    setBeastPrices,
    handleToggleCart,
    handleRemoveFromCart,
    handleClearCart,
    handleUpdateBeastPrice,
    isInCart,

    // Purchase cart
    purchaseCart,
    setPurchaseCart,
    handleAddToPurchaseCart,
    handleRemoveFromPurchaseCart,
    handleClearPurchaseCart,
    isInPurchaseCart,

    // Cancel cart
    cancelCart,
    setCancelCart,
    handleToggleCancelCart,
    handleRemoveFromCancelCart,
    handleClearCancelCart,
    handleAddAllToCancelCart,
    isInCancelCart,
  };
}

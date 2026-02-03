import { createContext, useContext, useState, useCallback, useRef, type ReactNode } from "react";

type SoldListingsContextValue = {
  /** Set of listing IDs that have been sold (optimistic) */
  soldListingIds: Set<string>;
  /** Mark a listing as sold (optimistic update) */
  markAsSold: (listingId: string) => void;
  /** Check if a listing has been marked as sold */
  isSold: (listingId: string) => boolean;
  /** Clear sold status for listings that no longer exist in fresh data */
  clearStaleIds: (currentListingIds: string[]) => void;
  /** Subscribe to offer made events (for refreshing offer lists) */
  subscribeToOfferMade: (callback: () => void) => () => void;
  /** Notify all subscribers that an offer was made */
  notifyOfferMade: () => void;
  /** Subscribe to purchase events (for refreshing data after purchase) */
  subscribeToPurchase: (callback: () => void) => () => void;
  /** Notify all subscribers that a purchase was made */
  notifyPurchase: () => void;
};

const SoldListingsContext = createContext<SoldListingsContextValue | null>(null);

export function SoldListingsProvider({ children }: { children: ReactNode }) {
  const [soldListingIds, setSoldListingIds] = useState<Set<string>>(new Set());
  const offerSubscribersRef = useRef<Set<() => void>>(new Set());
  const purchaseSubscribersRef = useRef<Set<() => void>>(new Set());

  const markAsSold = useCallback((listingId: string) => {
    setSoldListingIds((prev) => new Set([...prev, listingId]));
  }, []);

  const isSold = useCallback(
    (listingId: string) => soldListingIds.has(listingId),
    [soldListingIds]
  );

  const clearStaleIds = useCallback((currentListingIds: string[]) => {
    const currentSet = new Set(currentListingIds);
    setSoldListingIds((prev) => {
      const stillPending = new Set<string>();
      prev.forEach((id) => {
        // Keep IDs that are still in the current listings (not yet removed by indexer)
        if (currentSet.has(id)) {
          stillPending.add(id);
        }
      });
      return stillPending;
    });
  }, []);

  // Offer made subscription
  const subscribeToOfferMade = useCallback((callback: () => void) => {
    offerSubscribersRef.current.add(callback);
    return () => {
      offerSubscribersRef.current.delete(callback);
    };
  }, []);

  const notifyOfferMade = useCallback(() => {
    offerSubscribersRef.current.forEach((cb) => cb());
  }, []);

  // Purchase subscription
  const subscribeToPurchase = useCallback((callback: () => void) => {
    purchaseSubscribersRef.current.add(callback);
    return () => {
      purchaseSubscribersRef.current.delete(callback);
    };
  }, []);

  const notifyPurchase = useCallback(() => {
    purchaseSubscribersRef.current.forEach((cb) => cb());
  }, []);

  return (
    <SoldListingsContext.Provider
      value={{
        soldListingIds,
        markAsSold,
        isSold,
        clearStaleIds,
        subscribeToOfferMade,
        notifyOfferMade,
        subscribeToPurchase,
        notifyPurchase,
      }}
    >
      {children}
    </SoldListingsContext.Provider>
  );
}

export function useSoldListings() {
  const context = useContext(SoldListingsContext);
  if (!context) {
    throw new Error("useSoldListings must be used within a SoldListingsProvider");
  }
  return context;
}

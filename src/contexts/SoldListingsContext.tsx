import { createContext, useContext, useState, useCallback, useRef, useEffect, type ReactNode } from "react";

// localStorage key for persisting sold listing IDs
const STORAGE_KEY = "beastdex:sold-listings";
// Max age for persisted sold IDs (24 hours) - after this, re-validate
const MAX_PERSISTENCE_AGE_MS = 24 * 60 * 60 * 1000;

type PersistedSoldData = {
  ids: string[];
  timestamp: number;
};

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

/**
 * Load persisted sold IDs from localStorage
 */
function loadPersistedSoldIds(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return new Set();

    const data: PersistedSoldData = JSON.parse(raw);

    // Check if data is too old
    if (Date.now() - data.timestamp > MAX_PERSISTENCE_AGE_MS) {
      localStorage.removeItem(STORAGE_KEY);
      return new Set();
    }

    return new Set(data.ids);
  } catch {
    return new Set();
  }
}

/**
 * Save sold IDs to localStorage
 */
function persistSoldIds(ids: Set<string>): void {
  try {
    const data: PersistedSoldData = {
      ids: [...ids],
      timestamp: Date.now(),
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // Ignore storage errors (quota exceeded, etc.)
  }
}

export function SoldListingsProvider({ children }: { children: ReactNode }) {
  // Initialize from localStorage
  const [soldListingIds, setSoldListingIds] = useState<Set<string>>(() => loadPersistedSoldIds());
  const offerSubscribersRef = useRef<Set<() => void>>(new Set());
  const purchaseSubscribersRef = useRef<Set<() => void>>(new Set());

  // Persist to localStorage when sold IDs change
  useEffect(() => {
    persistSoldIds(soldListingIds);
  }, [soldListingIds]);

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

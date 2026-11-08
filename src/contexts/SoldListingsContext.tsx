import { createContext, useContext, useState, useCallback, useMemo, useRef, useEffect, type ReactNode } from "react";

// localStorage key for persisting sold listing IDs
const STORAGE_KEY = "beastdex:sold-listings";
/**
 * How long an optimistic "sold" mark may hide a listing that the indexer still
 * reports as active. The indexer catches up within a minute or so; past this,
 * the mark was wrong (e.g. a failed or rejected purchase) and the listing shows
 * again instead of staying hidden indefinitely.
 */
const SOLD_MARK_TTL_MS = 10 * 60 * 1000;

/** listingId -> when it was marked sold (ms) */
type SoldMarks = Map<string, number>;

type PersistedSoldData = {
  marks: Record<string, number>;
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

const isFresh = (markedAt: number, now = Date.now()) => now - markedAt < SOLD_MARK_TTL_MS;

/**
 * Load persisted sold marks from localStorage, dropping expired ones.
 * (The old `{ ids, timestamp }` format had no per-listing age and is discarded.)
 */
function loadPersistedSoldMarks(): SoldMarks {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return new Map();
    const data = JSON.parse(raw) as Partial<PersistedSoldData>;
    if (!data.marks || typeof data.marks !== "object") return new Map();
    const now = Date.now();
    return new Map(Object.entries(data.marks).filter(([, at]) => typeof at === "number" && isFresh(at, now)));
  } catch {
    return new Map();
  }
}

/**
 * Save sold marks to localStorage
 */
function persistSoldMarks(marks: SoldMarks): void {
  try {
    const data: PersistedSoldData = { marks: Object.fromEntries(marks) };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // Ignore storage errors (quota exceeded, etc.)
  }
}

export function SoldListingsProvider({ children }: { children: ReactNode }) {
  // Initialize from localStorage
  const [soldMarks, setSoldMarks] = useState<SoldMarks>(() => loadPersistedSoldMarks());
  const offerSubscribersRef = useRef<Set<() => void>>(new Set());
  const purchaseSubscribersRef = useRef<Set<() => void>>(new Set());

  // Persist to localStorage when sold marks change
  useEffect(() => {
    persistSoldMarks(soldMarks);
  }, [soldMarks]);

  const soldListingIds = useMemo(() => new Set(soldMarks.keys()), [soldMarks]);

  // Ids may arrive as numbers from SQL rows; key marks by their string form.
  const markAsSold = useCallback((listingId: string) => {
    setSoldMarks((prev) => new Map(prev).set(String(listingId), Date.now()));
  }, []);

  const isSold = useCallback(
    (listingId: string) => {
      const markedAt = soldMarks.get(String(listingId));
      return markedAt !== undefined && isFresh(markedAt);
    },
    [soldMarks]
  );

  const clearStaleIds = useCallback((currentListingIds: string[]) => {
    const currentSet = new Set(currentListingIds.map(String));
    const now = Date.now();
    setSoldMarks((prev) => {
      const stillPending: SoldMarks = new Map();
      prev.forEach((markedAt, id) => {
        // Keep marks for listings the indexer still reports (not yet caught up),
        // but only for a while: an old mark on a still-active listing was wrong.
        if (currentSet.has(id) && isFresh(markedAt, now)) {
          stillPending.set(id, markedAt);
        }
      });
      return stillPending.size === prev.size ? prev : stillPending;
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

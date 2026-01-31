import { createContext, useContext, useState, useCallback, type ReactNode } from "react";
import type { Beast } from "../services/beast";
import type { Listing } from "../services/marketplace/types";
import { toast } from "sonner";

interface GlobalCartContextValue {
  // List cart (beasts to list for sale)
  listCart: Beast[];
  addToListCart: (beast: Beast) => void;
  removeFromListCart: (beastId: string) => void;
  toggleListCart: (beast: Beast, alreadyListedTokenIds?: Set<string>) => void;
  clearListCart: () => void;
  isInListCart: (beastId: string) => boolean;

  // Purchase cart (listings to buy)
  purchaseCart: Listing[];
  addToPurchaseCart: (listing: Listing) => void;
  removeFromPurchaseCart: (listingId: string) => void;
  togglePurchaseCart: (listing: Listing) => void;
  clearPurchaseCart: () => void;
  isInPurchaseCart: (listingId: string) => boolean;

  // Dialog state
  listDialogOpen: boolean;
  purchaseDialogOpen: boolean;
  openListDialog: () => void;
  openPurchaseDialog: () => void;
  closeListDialog: () => void;
  closePurchaseDialog: () => void;
}

const GlobalCartContext = createContext<GlobalCartContextValue | null>(null);

export function GlobalCartProvider({ children }: { children: ReactNode }) {
  // List cart state
  const [listCart, setListCart] = useState<Beast[]>([]);

  // Purchase cart state
  const [purchaseCart, setPurchaseCart] = useState<Listing[]>([]);

  // List cart actions
  const addToListCart = useCallback((beast: Beast) => {
    setListCart((prev) => {
      if (prev.some((b) => b.id === beast.id)) return prev;
      return [...prev, beast];
    });
  }, []);

  const removeFromListCart = useCallback((beastId: string) => {
    setListCart((prev) => prev.filter((b) => b.id !== beastId));
  }, []);

  const toggleListCart = useCallback((beast: Beast, alreadyListedTokenIds?: Set<string>) => {
    // Check if beast is already listed
    if (alreadyListedTokenIds) {
      const tokenId = beast.id.split(":").pop() || beast.id;
      if (alreadyListedTokenIds.has(tokenId)) {
        toast.error("This beast is already listed on the marketplace");
        return;
      }
    }

    setListCart((prev) => {
      const inCart = prev.some((b) => b.id === beast.id);
      if (inCart) {
        return prev.filter((b) => b.id !== beast.id);
      }
      return [...prev, beast];
    });
  }, []);

  const clearListCart = useCallback(() => {
    setListCart([]);
  }, []);

  const isInListCart = useCallback((beastId: string) => {
    return listCart.some((b) => b.id === beastId);
  }, [listCart]);

  // Purchase cart actions
  const addToPurchaseCart = useCallback((listing: Listing) => {
    setPurchaseCart((prev) => {
      if (prev.some((l) => l.listingId === listing.listingId)) return prev;
      return [...prev, listing];
    });
  }, []);

  const removeFromPurchaseCart = useCallback((listingId: string) => {
    setPurchaseCart((prev) => prev.filter((l) => l.listingId !== listingId));
  }, []);

  const togglePurchaseCart = useCallback((listing: Listing) => {
    setPurchaseCart((prev) => {
      const inCart = prev.some((l) => l.listingId === listing.listingId);
      if (inCart) {
        return prev.filter((l) => l.listingId !== listing.listingId);
      }
      return [...prev, listing];
    });
  }, []);

  const clearPurchaseCart = useCallback(() => {
    setPurchaseCart([]);
  }, []);

  const isInPurchaseCart = useCallback((listingId: string) => {
    return purchaseCart.some((l) => l.listingId === listingId);
  }, [purchaseCart]);

  // Dialog state
  const [listDialogOpen, setListDialogOpen] = useState(false);
  const [purchaseDialogOpen, setPurchaseDialogOpen] = useState(false);

  const openListDialog = useCallback(() => setListDialogOpen(true), []);
  const openPurchaseDialog = useCallback(() => setPurchaseDialogOpen(true), []);
  const closeListDialog = useCallback(() => setListDialogOpen(false), []);
  const closePurchaseDialog = useCallback(() => setPurchaseDialogOpen(false), []);

  const value: GlobalCartContextValue = {
    listCart,
    addToListCart,
    removeFromListCart,
    toggleListCart,
    clearListCart,
    isInListCart,
    purchaseCart,
    addToPurchaseCart,
    removeFromPurchaseCart,
    togglePurchaseCart,
    clearPurchaseCart,
    isInPurchaseCart,
    listDialogOpen,
    purchaseDialogOpen,
    openListDialog,
    openPurchaseDialog,
    closeListDialog,
    closePurchaseDialog,
  };

  return (
    <GlobalCartContext.Provider value={value}>
      {children}
    </GlobalCartContext.Provider>
  );
}

export function useGlobalCart() {
  const context = useContext(GlobalCartContext);
  if (!context) {
    throw new Error("useGlobalCart must be used within a GlobalCartProvider");
  }
  return context;
}

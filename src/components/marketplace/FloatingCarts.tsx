import { Tag, ShoppingCart } from "lucide-react";
import { useGlobalCart } from "../../contexts/GlobalCartContext";

export function FloatingCarts() {
  const { listCart, purchaseCart, openListDialog, openPurchaseDialog } = useGlobalCart();

  const hasListItems = listCart.length > 0;
  const hasPurchaseItems = purchaseCart.length > 0;

  if (!hasListItems && !hasPurchaseItems) return null;

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-3">
      {/* List Beasts Cart */}
      {hasListItems && (
        <button
          onClick={openListDialog}
          className="flex items-center gap-2 px-4 py-3 bg-gradient-to-r from-amber-600 to-orange-600 text-white rounded-full shadow-2xl hover:shadow-3xl hover:scale-105 transition-all duration-300 font-semibold text-sm group"
        >
          <Tag className="h-5 w-5 group-hover:rotate-12 transition-transform" />
          <span className="flex items-center gap-1.5">
            List Beasts
            <span className="bg-white/20 px-2 py-0.5 rounded-full text-xs font-bold">
              {listCart.length}
            </span>
          </span>
        </button>
      )}

      {/* Buy Beasts Cart */}
      {hasPurchaseItems && (
        <button
          onClick={openPurchaseDialog}
          className="flex items-center gap-2 px-4 py-3 bg-gradient-to-r from-green-600 to-emerald-600 text-white rounded-full shadow-2xl hover:shadow-3xl hover:scale-105 transition-all duration-300 font-semibold text-sm group"
        >
          <ShoppingCart className="h-5 w-5 group-hover:rotate-12 transition-transform" />
          <span className="flex items-center gap-1.5">
            Buy Beasts
            <span className="bg-white/20 px-2 py-0.5 rounded-full text-xs font-bold">
              {purchaseCart.length}
            </span>
          </span>
        </button>
      )}
    </div>
  );
}

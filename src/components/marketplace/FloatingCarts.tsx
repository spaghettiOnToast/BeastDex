import { Tag, ShoppingCart } from "lucide-react";
import { useNavigate, useLocation } from "react-router-dom";
import { useGlobalCart } from "../../contexts/GlobalCartContext";

interface FloatingCartsProps {
  onOpenListCart?: () => void;
  onOpenPurchaseCart?: () => void;
}

export function FloatingCarts({ onOpenListCart, onOpenPurchaseCart }: FloatingCartsProps) {
  const { listCart, purchaseCart } = useGlobalCart();
  const navigate = useNavigate();
  const location = useLocation();

  const isOnMarketplace = location.pathname === "/marketplace";
  const hasListItems = listCart.length > 0;
  const hasPurchaseItems = purchaseCart.length > 0;

  // If no callbacks provided and we're on marketplace, don't render (MarketplacePage renders its own)
  if (isOnMarketplace && !onOpenListCart && !onOpenPurchaseCart) return null;

  if (!hasListItems && !hasPurchaseItems) return null;

  const handleListCartClick = () => {
    if (onOpenListCart) {
      onOpenListCart();
    } else {
      // Navigate to marketplace with state to open list dialog
      navigate("/marketplace", { state: { openListDialog: true } });
    }
  };

  const handlePurchaseCartClick = () => {
    if (onOpenPurchaseCart) {
      onOpenPurchaseCart();
    } else {
      // Navigate to marketplace with state to open purchase dialog
      navigate("/marketplace", { state: { openPurchaseDialog: true } });
    }
  };

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-3">
      {/* List Beasts Cart */}
      {hasListItems && (
        <button
          onClick={handleListCartClick}
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
          onClick={handlePurchaseCartClick}
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

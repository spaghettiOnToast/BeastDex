import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "../ui/dialog";
import { Button } from "../ui/button";
import type { Listing } from "../../services/marketplace/types";
import type { Beast } from "../../services/beast";
import { X, ShoppingBag, Tag } from "lucide-react";
import { formatPrice, formatPriceInSymbol, type RatesInSTRK } from "../../utils/price";
import { getPaymentTokenByAddress } from "../../services/marketplace/constants";
import { Input } from "../ui/input";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  buyItems: Listing[];
  listBeasts: Beast[];
  beastPrices: Map<string, string>;
  onRemoveBuyItem: (listingId: string) => void;
  onRemoveListBeast: (beastId: string) => void;
  onUpdateBeastPrice: (beastId: string, price: string) => void;
  onClearAll: () => void;
  onExecuteAll: () => void;
  isProcessing: boolean;
  displayCurrency?: 'STRK' | 'LORDS' | 'USDC' | 'ETH' | 'SURVIVOR';
  priceRates?: RatesInSTRK | null;
  selectedToken: { symbol: string; address: string };
};

export default function UnifiedCartDialog({
  open,
  onOpenChange,
  buyItems,
  listBeasts,
  beastPrices,
  onRemoveBuyItem,
  onRemoveListBeast,
  onUpdateBeastPrice,
  onClearAll,
  onExecuteAll,
  isProcessing,
  displayCurrency,
  priceRates,
  selectedToken,
}: Props) {
  const totalBuyPrice = buyItems.reduce((sum, listing) => {
    try {
      return sum + BigInt(listing.price);
    } catch {
      return sum;
    }
  }, 0n);

  const formatListingPrice = (listing: Listing) => {
    const token = getPaymentTokenByAddress(listing.paymentToken ?? undefined);
    const fromSymbol = token?.symbol ?? "STRK";

    if (displayCurrency && priceRates && fromSymbol.toUpperCase() !== displayCurrency.toUpperCase()) {
      return formatPriceInSymbol(listing.price, fromSymbol, displayCurrency, priceRates as any);
    }

    return formatPrice(listing.price, fromSymbol);
  };

  const totalItems = buyItems.length + listBeasts.length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-[#0b0b0f] border-gray-800 max-w-3xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Cart ({totalItems} items)</DialogTitle>
          <DialogDescription>
            List beasts and buy others in a single transaction
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-4 pr-2">
          {/* Buy Section */}
          {buyItems.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm font-semibold text-green-400">
                <ShoppingBag className="h-4 w-4" />
                <span>Purchases ({buyItems.length})</span>
              </div>
              {buyItems.map((listing) => (
                <div
                  key={listing.listingId}
                  className="flex items-center gap-3 p-3 rounded-lg bg-green-900/20 border border-green-800/50 hover:border-green-700 transition-colors"
                >
                  {listing.beast?.image && (
                    <img
                      src={listing.beast.image}
                      alt={listing.beast.name}
                      className="w-14 h-14 rounded object-cover"
                    />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate text-sm">
                      {listing.beast?.name || `Beast #${listing.tokenId}`}
                    </p>
                    <p className="text-xs text-green-400">{formatListingPrice(listing)}</p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onRemoveBuyItem(listing.listingId)}
                    className="text-gray-400 hover:text-red-500"
                    disabled={isProcessing}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}

          {/* List Section */}
          {listBeasts.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm font-semibold text-amber-400">
                <Tag className="h-4 w-4" />
                <span>Listings ({listBeasts.length})</span>
              </div>
              {listBeasts.map((beast) => {
                const priceStr = beastPrices.get(beast.id) || "";
                return (
                  <div
                    key={beast.id}
                    className="flex items-center gap-3 p-3 rounded-lg bg-amber-900/20 border border-amber-800/50 hover:border-amber-700 transition-colors"
                  >
                    {beast.image && (
                      <img
                        src={beast.image}
                        alt={beast.name}
                        className="w-14 h-14 rounded object-cover"
                      />
                    )}
                    <div className="flex-1 min-w-0 space-y-1">
                      <p className="font-medium truncate text-sm">{beast.name}</p>
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        value={priceStr}
                        onChange={(e) => onUpdateBeastPrice(beast.id, e.target.value)}
                        placeholder={`Price in ${selectedToken.symbol}`}
                        className="h-7 text-xs"
                      />
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onRemoveListBeast(beast.id)}
                      className="text-gray-400 hover:text-red-500"
                      disabled={isProcessing}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                );
              })}
            </div>
          )}

          {totalItems === 0 && (
            <div className="text-center py-12 text-gray-400">
              <ShoppingBag className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p>Your cart is empty</p>
              <p className="text-xs mt-1">Add beasts to list or buy</p>
            </div>
          )}
        </div>

        {totalItems > 0 && (
          <>
            <div className="border-t border-gray-800 pt-4 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">Purchases:</span>
                <span className="font-medium">{buyItems.length} items</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">Listings:</span>
                <span className="font-medium">{listBeasts.length} items</span>
              </div>
              {buyItems.length > 0 && (
                <div className="flex justify-between text-sm border-t border-gray-700 pt-2">
                  <span className="text-gray-400">Total to Pay:</span>
                  <span className="text-green-400 font-semibold">
                    {formatPrice(totalBuyPrice, displayCurrency || 'LORDS')}
                  </span>
                </div>
              )}
              <div className="rounded-md bg-blue-500/10 border border-blue-500/20 p-2.5">
                <p className="text-xs text-blue-200">
                  ℹ️ All operations will be executed in a single transaction. This cannot be reversed.
                </p>
              </div>
            </div>

            <DialogFooter className="flex gap-2">
              <Button
                variant="outline"
                onClick={onClearAll}
                disabled={isProcessing}
                className="flex-1"
              >
                Clear All
              </Button>
              <Button
                onClick={onExecuteAll}
                disabled={isProcessing || totalItems === 0}
                className="flex-1 bg-gradient-to-r from-green-600 to-amber-600 text-white hover:from-green-700 hover:to-amber-700"
              >
                {isProcessing ? "Processing..." : `Execute All (${totalItems})`}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

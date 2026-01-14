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
import { X } from "lucide-react";
import { formatPrice } from "../../utils/price";
import { getPaymentTokenByAddress } from "../../services/marketplace/constants";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  listings: Listing[];
  onRemove: (listingId: string) => void;
  onClearAll: () => void;
  onPurchaseAll: () => void;
  isProcessing: boolean;
};

export default function PurchaseCartDialog({
  open,
  onOpenChange,
  listings,
  onRemove,
  onClearAll,
  onPurchaseAll,
  isProcessing,
}: Props) {
  // Group listings by payment token
  const listingsByToken = listings.reduce((acc, listing) => {
    const tokenAddress = listing.paymentToken ?? 'default';
    if (!acc[tokenAddress]) {
      acc[tokenAddress] = [];
    }
    acc[tokenAddress].push(listing);
    return acc;
  }, {} as Record<string, Listing[]>);

  // Calculate totals per token
  const tokenTotals = Object.entries(listingsByToken).map(([tokenAddress, tokenListings]) => {
    const total = tokenListings.reduce((sum, listing) => {
      try {
        return sum + BigInt(listing.price);
      } catch {
        return sum;
      }
    }, 0n);
    const token = getPaymentTokenByAddress(tokenAddress !== 'default' ? tokenAddress : undefined);
    return {
      tokenAddress,
      tokenSymbol: token?.symbol ?? 'STRK',
      total,
      count: tokenListings.length,
    };
  });

  const formatListingPrice = (listing: Listing) => {
    const token = getPaymentTokenByAddress(listing.paymentToken ?? undefined);
    const fromSymbol = token?.symbol ?? "STRK";
    return formatPrice(listing.price, fromSymbol);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-[#0b0b0f] border-gray-800 max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Purchase Cart ({listings.length} items)</DialogTitle>
          <DialogDescription>
            Review and purchase all items in your cart
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-2 pr-2">
          {listings.map((listing) => (
            <div
              key={listing.listingId}
              className="flex items-center gap-3 p-3 rounded-lg bg-gray-900/50 border border-gray-800 hover:border-gray-700 transition-colors"
            >
              {listing.beast?.image && (
                <img
                  src={listing.beast.image}
                  alt={listing.beast.name}
                  className="w-16 h-16 rounded object-cover"
                />
              )}
              <div className="flex-1 min-w-0">
                <p className="font-medium truncate">
                  {listing.beast?.name || `Beast #${listing.tokenId}`}
                </p>
                <p className="text-sm text-lsGold">{formatListingPrice(listing)}</p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onRemove(listing.listingId)}
                className="text-gray-400 hover:text-red-500"
                disabled={isProcessing}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>

        {listings.length === 0 ? (
          <div className="text-center py-8 text-gray-400">
            Your cart is empty
          </div>
        ) : (
          <>
            <div className="border-t border-gray-800 pt-4 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">Items:</span>
                <span className="font-medium">{listings.length}</span>
              </div>
              <div className="border-t border-gray-700 pt-2 space-y-1">
                <p className="text-sm text-white font-semibold mb-2">Total to Pay:</p>
                {tokenTotals.map((tokenTotal) => (
                  <div key={tokenTotal.tokenAddress} className="flex justify-between text-base">
                    <span className="text-gray-400">{tokenTotal.tokenSymbol}:</span>
                    <span className="text-lsGold font-semibold">
                      {formatPrice(tokenTotal.total, tokenTotal.tokenSymbol)}
                    </span>
                  </div>
                ))}
              </div>
              <p className="text-[10px] text-gray-500 italic">
                No buyer fee - platform fees were paid by sellers on listing. Each purchase uses the token specified in the listing.
              </p>
              <div className="rounded-md bg-yellow-500/10 border border-yellow-500/20 p-3">
                <p className="text-xs text-yellow-200">
                  ⚠️ All purchases will be executed in a single transaction. This cannot be reversed.
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
                onClick={onPurchaseAll}
                disabled={isProcessing || listings.length === 0}
                className="flex-1 bg-green-600 text-white hover:bg-green-600/90"
              >
                {isProcessing ? "Processing..." : `Buy All (${listings.length})`}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

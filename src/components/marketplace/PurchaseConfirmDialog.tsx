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
import { formatPrice } from "../../utils/price";
import { getPaymentTokenByAddress } from "../../services/marketplace/constants";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  listing: Listing | null;
  priceLabel: string;
  onConfirm: () => void;
  isProcessing: boolean;
};

export default function PurchaseConfirmDialog({
  open,
  onOpenChange,
  listing,
  priceLabel,
  onConfirm,
  isProcessing,
}: Props) {
  if (!listing) return null;

  // No buyer fee - seller pays on listing
  const priceBigInt = BigInt(listing.price);
  const totalBigInt = priceBigInt;

  const token = getPaymentTokenByAddress(listing.paymentToken);
  const tokenSymbol = token?.symbol || 'STRK';
  const totalLabel = formatPrice(totalBigInt, tokenSymbol);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-[#0b0b0f] border-gray-800">
        <DialogHeader>
          <DialogTitle>Confirm Purchase</DialogTitle>
          <DialogDescription>
            Review your purchase details before confirming.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {listing.beast?.image && (
            <div className="flex justify-center">
              <img
                src={listing.beast.image}
                alt={listing.beast.name}
                className="w-32 h-32 rounded object-cover"
              />
            </div>
          )}

          <div className="space-y-2">
            <div className="flex justify-between">
              <span className="text-sm text-gray-400">Beast:</span>
              <span className="text-sm font-medium">
                {listing.beast?.name || `#${listing.tokenId}`}
              </span>
            </div>

            <div className="flex justify-between">
              <span className="text-sm text-gray-400">Price:</span>
              <span className="text-sm font-medium text-lsGold">{priceLabel}</span>
            </div>

            <div className="flex justify-between border-t border-gray-700 pt-2">
              <span className="text-sm font-semibold text-white">Total to Pay:</span>
              <span className="text-sm font-semibold text-lsGold">{totalLabel}</span>
            </div>

            <p className="text-[10px] text-gray-500 italic">
              No buyer fee - platform fee was paid by seller on listing
            </p>

            <div className="flex justify-between">
              <span className="text-sm text-gray-400">Seller:</span>
              <span className="text-xs font-mono text-gray-300">
                {listing.seller.slice(0, 6)}...{listing.seller.slice(-4)}
              </span>
            </div>
          </div>

          <div className="rounded-md bg-yellow-500/10 border border-yellow-500/20 p-3">
            <p className="text-xs text-yellow-200">
              ⚠️ This transaction cannot be reversed. Please verify all details before confirming.
            </p>
          </div>
        </div>

        <DialogFooter className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isProcessing}
            className="flex-1"
          >
            Cancel
          </Button>
          <Button
            onClick={onConfirm}
            disabled={isProcessing}
            className="flex-1 bg-lsGold text-black hover:bg-lsGold/90"
          >
            {isProcessing ? "Processing..." : "Confirm Purchase"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

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
import { getPaymentTokenByAddress, CLIENT_FEE_BP } from "../../services/marketplace/constants";
import { toBigIntSafe } from "../../utils/bigint";
import TokenIcon from "../ui/TokenIcon";

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

  const priceBigInt = toBigIntSafe(listing.price);
  // Buyer pays platform fee (basis points out of 10000)
  const buyerFeeBigInt = CLIENT_FEE_BP > 0 ? (priceBigInt * BigInt(CLIENT_FEE_BP)) / 10000n : 0n;
  const totalBigInt = priceBigInt + buyerFeeBigInt;

  const token = getPaymentTokenByAddress(listing.paymentToken);
  const tokenSymbol = token?.symbol || "STRK";
  const buyerFeeLabel = formatPrice(buyerFeeBigInt, tokenSymbol);
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
                className="max-w-[200px] w-full rounded-lg"
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
              <span className="text-sm text-gray-400">Listing Price:</span>
              <span className="text-sm font-medium">{priceLabel}</span>
            </div>

            {CLIENT_FEE_BP > 0 && (
              <div className="flex justify-between">
                <span className="text-sm text-gray-400">Platform Fee ({CLIENT_FEE_BP / 100}%):</span>
                <span className="text-sm font-medium text-gray-400">
                  {buyerFeeLabel}
                </span>
              </div>
            )}

            <div className="flex justify-between border-t border-gray-700 pt-2 mt-2">
              <span className="text-sm font-semibold text-white">
                Total to Pay:
              </span>
              <span className="text-sm font-semibold text-lsGold">
                {totalLabel}
              </span>
            </div>

            <div className="flex justify-between">
              <span className="text-sm text-gray-400">Payment Currency:</span>
              <div className="flex items-center gap-2">
                <TokenIcon symbol={tokenSymbol} size="sm" />
                <span className="text-sm font-medium text-lsGold">
                  {tokenSymbol}
                </span>
              </div>
            </div>

            <div className="flex justify-between">
              <span className="text-sm text-gray-400">Seller:</span>
              <span className="text-xs font-mono text-gray-300">
                {listing.seller.slice(0, 6)}...{listing.seller.slice(-4)}
              </span>
            </div>
          </div>

          <div className="rounded-md bg-yellow-500/10 border border-yellow-500/20 p-3">
            <p className="text-xs text-yellow-200">
              ⚠️ This transaction cannot be reversed. Please verify all details
              before confirming.
            </p>
          </div>
        </div>

        <DialogFooter className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isProcessing}
            className="flex-1 border-gray-600 hover:border-gray-500"
          >
            Cancel
          </Button>
          <Button
            onClick={onConfirm}
            disabled={isProcessing}
            className="flex-1 font-bold bg-lsGold/20 text-lsGold border border-lsGold hover:bg-lsGold/30"
          >
            {isProcessing ? "Processing..." : "Confirm Purchase"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

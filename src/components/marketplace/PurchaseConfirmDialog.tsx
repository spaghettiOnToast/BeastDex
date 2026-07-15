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
import { useSelectedToken, tokenAmountToUsd } from "../../hooks/useEkuboTokens";
import { useControllerUsernames } from "../../hooks/useControllerUsernames";
import { normaliseStarknetAddress } from "../../utils/address";
import BeastCard from "../beast/BeastCard";

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
  const { decimals: tokenDecimals, usdPrice } = useSelectedToken(listing?.paymentToken ?? undefined);
  const { usernames: sellerUsernames } = useControllerUsernames([listing?.seller]);

  if (!listing) return null;

  const normalizedSeller = normaliseStarknetAddress(listing.seller);
  const sellerDisplay = (normalizedSeller && sellerUsernames[normalizedSeller]) ||
    `${listing.seller.slice(0, 6)}...${listing.seller.slice(-4)}`;

  const priceBigInt = toBigIntSafe(listing.price);
  // Buyer pays platform fee (basis points out of 10000)
  const buyerFeeBigInt = CLIENT_FEE_BP > 0 ? (priceBigInt * BigInt(CLIENT_FEE_BP)) / 10000n : 0n;
  const totalBigInt = priceBigInt + buyerFeeBigInt;

  const token = getPaymentTokenByAddress(listing.paymentToken);
  const tokenSymbol = token?.symbol || "STRK";
  const buyerFeeLabel = formatPrice(buyerFeeBigInt, tokenSymbol);
  const totalLabel = formatPrice(totalBigInt, tokenSymbol);

  // Calculate USD values
  const priceUsd = usdPrice ? tokenAmountToUsd(priceBigInt, tokenDecimals, usdPrice) : null;
  const feeUsd = usdPrice ? tokenAmountToUsd(buyerFeeBigInt, tokenDecimals, usdPrice) : null;
  const totalUsd = usdPrice ? tokenAmountToUsd(totalBigInt, tokenDecimals, usdPrice) : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-surface-overlay border border-white/[0.06]">
        <DialogHeader>
          <DialogTitle>Confirm Purchase</DialogTitle>
          <DialogDescription>
            Review your purchase details before confirming.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {listing.beast && (
            <div className="flex justify-center">
              <div className="w-[200px]">
                <BeastCard beast={listing.beast} />
              </div>
            </div>
          )}

          <div className="space-y-2">
            <div className="flex justify-between">
              <span className="text-sm text-zinc-400">Beast:</span>
              <span className="text-sm font-medium">
                {listing.beast?.name || `#${listing.tokenId}`}
              </span>
            </div>

            <div className="flex justify-between">
              <span className="text-sm text-zinc-400">Listing Price:</span>
              <div className="text-right">
                <span className="text-sm font-medium">{priceLabel}</span>
                {priceUsd !== null && (
                  <span className="text-xs text-zinc-500 ml-2">${priceUsd.toFixed(2)}</span>
                )}
              </div>
            </div>

            {CLIENT_FEE_BP > 0 && (
              <div className="flex justify-between">
                <span className="text-sm text-zinc-400">Client Fee ({CLIENT_FEE_BP / 100}%):</span>
                <div className="text-right">
                  <span className="text-sm font-medium text-zinc-400">
                    +{buyerFeeLabel}
                  </span>
                  {feeUsd !== null && (
                    <span className="text-xs text-zinc-500 ml-2">${feeUsd.toFixed(2)}</span>
                  )}
                </div>
              </div>
            )}

            <div className="flex justify-between border-t border-white/[0.08] pt-2 mt-2">
              <span className="text-sm font-semibold text-white">
                Total to Pay:
              </span>
              <div className="text-right">
                <span className="text-sm font-semibold text-gold">
                  {totalLabel}
                </span>
                {totalUsd !== null && (
                  <span className="text-sm text-zinc-400 ml-2">${totalUsd.toFixed(2)}</span>
                )}
              </div>
            </div>

            <div className="flex justify-between">
              <span className="text-sm text-zinc-400">Payment Currency:</span>
              <div className="flex items-center gap-2">
                <TokenIcon symbol={tokenSymbol} size="sm" />
                <span className="text-sm font-medium text-gold">
                  {tokenSymbol}
                </span>
              </div>
            </div>

            <div className="flex justify-between">
              <span className="text-sm text-zinc-400">Seller:</span>
              <span className="text-xs font-mono text-zinc-300">
                {sellerDisplay}
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
            className="flex-1 border-white/[0.10] hover:border-white/[0.15]"
          >
            Cancel
          </Button>
          <Button
            onClick={onConfirm}
            disabled={isProcessing}
            className="flex-1 font-bold bg-gold/15 text-gold border border-gold hover:bg-gold/20"
          >
            {isProcessing ? "Processing..." : "Confirm Purchase"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

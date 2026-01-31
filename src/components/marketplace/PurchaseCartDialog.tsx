import { useState, useEffect, useCallback } from "react";
import { useAccount } from "@starknet-react/core";
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
import { X, AlertTriangle } from "lucide-react";
import { formatPrice } from "../../utils/price";
import { getPaymentTokenByAddress, BEASTS_COLLECTION_ADDRESS, CLIENT_FEE_BP } from "../../services/marketplace/constants";
import { toBigIntSafe } from "../../utils/bigint";
import { validateListingOwnership, getProvider } from "../../services/marketplace/approvals";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  listings: Listing[];
  onRemove: (listingId: string) => void;
  onClearAll: () => void;
  onPurchaseAll: (validListings?: Listing[]) => void;
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
  const { account } = useAccount();
  const [invalidListingIds, setInvalidListingIds] = useState<Set<string>>(new Set());
  const [isValidating, setIsValidating] = useState(false);
  const [hasValidated, setHasValidated] = useState(false);

  // Validate all listings when dialog opens or listings change
  const validateListings = useCallback(async () => {
    if (!account || listings.length === 0) return;

    setIsValidating(true);
    const invalid = new Set<string>();

    try {
      const provider = getProvider(account);

      // Validate each listing in parallel via ownerOf calls
      const validationPromises = listings.map(async (listing) => {
        try {
          const tokenIdBigInt = BigInt(listing.tokenId);
          const isValid = await validateListingOwnership(
            provider,
            BEASTS_COLLECTION_ADDRESS,
            tokenIdBigInt,
            listing.seller
          );
          return { listingId: listing.listingId, isValid };
        } catch {
          return { listingId: listing.listingId, isValid: false };
        }
      });

      const results = await Promise.all(validationPromises);
      for (const result of results) {
        if (!result.isValid) {
          invalid.add(result.listingId);
        }
      }
    } catch (error) {
      console.error("Error validating cart listings:", error);
    }

    setInvalidListingIds(invalid);
    setIsValidating(false);
    setHasValidated(true);
  }, [account, listings]);

  // Validate when dialog opens
  useEffect(() => {
    if (open && listings.length > 0) {
      setHasValidated(false);
      validateListings();
    }
  }, [open, listings.length]);

  // Reset validation state when dialog closes
  useEffect(() => {
    if (!open) {
      setInvalidListingIds(new Set());
      setHasValidated(false);
    }
  }, [open]);

  const validListings = listings.filter(l => !invalidListingIds.has(l.listingId));
  const invalidListings = listings.filter(l => invalidListingIds.has(l.listingId));
  const hasInvalidListings = invalidListings.length > 0;

  const handlePurchaseClick = () => {
    if (hasInvalidListings) {
      onPurchaseAll(validListings);
    } else {
      onPurchaseAll();
    }
  };

  const removeInvalidListings = () => {
    for (const listing of invalidListings) {
      onRemove(listing.listingId);
    }
  };

  // Group VALID listings by payment token
  const listingsByToken = validListings.reduce((acc, listing) => {
    const tokenAddress = listing.paymentToken ?? 'default';
    if (!acc[tokenAddress]) {
      acc[tokenAddress] = [];
    }
    acc[tokenAddress].push(listing);
    return acc;
  }, {} as Record<string, Listing[]>);

  // Calculate totals per token with fee breakdown
  const tokenTotals = Object.entries(listingsByToken).map(([tokenAddress, tokenListings]) => {
    const subtotal = tokenListings.reduce((sum, listing) => {
      try {
        return sum + toBigIntSafe(listing.price);
      } catch {
        return sum;
      }
    }, 0n);
    const fee = (subtotal * BigInt(CLIENT_FEE_BP)) / 10000n;
    const total = subtotal + fee;
    const token = getPaymentTokenByAddress(tokenAddress !== 'default' ? tokenAddress : undefined);
    return {
      tokenAddress,
      tokenSymbol: token?.symbol ?? 'STRK',
      subtotal,
      fee,
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
          {isValidating && (
            <div className="text-center py-2 text-xs text-gray-400">
              Validating listings...
            </div>
          )}
          {listings.map((listing) => {
            const isInvalid = invalidListingIds.has(listing.listingId);
            return (
              <div
                key={listing.listingId}
                className={`flex items-center gap-3 p-3 rounded-lg border transition-colors ${
                  isInvalid
                    ? "bg-red-900/20 border-red-800/50 opacity-60"
                    : "bg-gray-900/50 border-gray-800 hover:border-gray-700"
                }`}
              >
                {listing.beast?.image && (
                  <img
                    src={listing.beast.image}
                    alt={listing.beast.name}
                    className={`w-16 h-16 rounded object-cover ${isInvalid ? "grayscale" : ""}`}
                  />
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className={`font-medium truncate ${isInvalid ? "text-gray-500" : ""}`}>
                      {listing.beast?.name || `Beast #${listing.tokenId}`}
                    </p>
                    {isInvalid && (
                      <span className="flex items-center gap-1 text-[10px] bg-red-500/20 text-red-400 px-2 py-0.5 rounded">
                        <AlertTriangle className="h-3 w-3" />
                        Unavailable
                      </span>
                    )}
                  </div>
                  <p className={`text-sm ${isInvalid ? "text-gray-500 line-through" : "text-lsGold"}`}>
                    {formatListingPrice(listing)}
                  </p>
                  {isInvalid && (
                    <p className="text-[10px] text-red-400 mt-1">
                      Seller no longer owns this beast
                    </p>
                  )}
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
            );
          })}
        </div>

        {listings.length === 0 ? (
          <div className="text-center py-8 text-gray-400">
            Your cart is empty
          </div>
        ) : (
          <>
            <div className="border-t border-gray-800 pt-4 space-y-2">
              {hasInvalidListings && hasValidated && (
                <div className="rounded-md bg-red-500/10 border border-red-500/20 p-3 mb-3">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="h-4 w-4 text-red-400 mt-0.5 flex-shrink-0" />
                    <div className="flex-1">
                      <p className="text-sm text-red-300 font-medium">
                        {invalidListings.length} item{invalidListings.length > 1 ? 's' : ''} no longer available
                      </p>
                      <p className="text-xs text-red-400/80 mt-1">
                        {invalidListings.length > 1 ? 'These items have' : 'This item has'} been sold or the seller no longer owns {invalidListings.length > 1 ? 'them' : 'it'}.
                        {validListings.length > 0 && ` You can continue with the ${validListings.length} valid item${validListings.length > 1 ? 's' : ''}.`}
                      </p>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={removeInvalidListings}
                        className="mt-2 text-xs h-7 border-red-500/30 text-red-300 hover:bg-red-500/10"
                      >
                        Remove Unavailable Items
                      </Button>
                    </div>
                  </div>
                </div>
              )}

              <div className="flex justify-between text-sm">
                <span className="text-gray-400">Total Items:</span>
                <span className="font-medium">
                  {validListings.length}
                  {hasInvalidListings && (
                    <span className="text-red-400 ml-1">
                      ({invalidListings.length} unavailable)
                    </span>
                  )}
                </span>
              </div>
              {validListings.length > 0 && (
                <div className="border-t border-gray-700 pt-2 space-y-2">
                  {tokenTotals.map((tokenTotal) => (
                    <div key={tokenTotal.tokenAddress} className="space-y-1">
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-400">Subtotal ({tokenTotal.tokenSymbol}):</span>
                        <span className="text-white">
                          {formatPrice(tokenTotal.subtotal, tokenTotal.tokenSymbol)}
                        </span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-400">Client Fee ({CLIENT_FEE_BP / 100}%):</span>
                        <span className="text-gray-300">
                          +{formatPrice(tokenTotal.fee, tokenTotal.tokenSymbol)}
                        </span>
                      </div>
                      <div className="flex justify-between text-base font-semibold border-t border-gray-700 pt-1">
                        <span className="text-gray-300">Total ({tokenTotal.tokenSymbol}):</span>
                        <span className="text-lsGold">
                          {formatPrice(tokenTotal.total, tokenTotal.tokenSymbol)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <p className="text-[10px] text-gray-500 italic">
                A {CLIENT_FEE_BP / 100}% client fee is added to each purchase. Each purchase uses the token specified in the listing.
              </p>
              {validListings.length > 0 && (
                <div className="rounded-md bg-yellow-500/10 border border-yellow-500/20 p-3">
                  <p className="text-xs text-yellow-200">
                    ⚠️ All purchases will be executed in a single transaction. This cannot be reversed.
                  </p>
                </div>
              )}
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
                onClick={handlePurchaseClick}
                disabled={isProcessing || validListings.length === 0 || isValidating}
                className="flex-1 bg-green-600 text-white hover:bg-green-600/90"
              >
                {isProcessing
                  ? "Processing..."
                  : isValidating
                  ? "Validating..."
                  : validListings.length === 0
                  ? "No Valid Items"
                  : `Buy ${validListings.length} Item${validListings.length > 1 ? 's' : ''}`}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

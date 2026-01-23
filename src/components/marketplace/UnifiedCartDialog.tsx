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
import type { Beast } from "../../services/beast";
import { X, ShoppingBag, Tag, AlertTriangle } from "lucide-react";
import { formatPrice } from "../../utils/price";
import { getPaymentTokenByAddress, BEASTS_COLLECTION_ADDRESS, CLIENT_FEE_BP } from "../../services/marketplace/constants";
import { toBigIntSafe } from "../../utils/bigint";
import { Input } from "../ui/input";
import { validateListingOwnership, getProvider } from "../../services/marketplace/approvals";

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
  onExecuteAll: (validBuyItems?: Listing[]) => void;
  isProcessing: boolean;
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
  selectedToken,
}: Props) {
  const { account } = useAccount();
  const [invalidListingIds, setInvalidListingIds] = useState<Set<string>>(new Set());
  const [isValidating, setIsValidating] = useState(false);
  const [hasValidated, setHasValidated] = useState(false);

  // Validate all buy items when dialog opens or items change
  const validateBuyItems = useCallback(async () => {
    if (!account || buyItems.length === 0) return;

    setIsValidating(true);
    const invalid = new Set<string>();

    try {
      const provider = getProvider(account);

      // Validate each listing in parallel via ownerOf calls
      const validationPromises = buyItems.map(async (listing) => {
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
      console.error("Error validating cart buy items:", error);
    }

    setInvalidListingIds(invalid);
    setIsValidating(false);
    setHasValidated(true);
  }, [account, buyItems]);

  // Validate when dialog opens
  useEffect(() => {
    if (open && buyItems.length > 0) {
      setHasValidated(false);
      validateBuyItems();
    }
  }, [open, buyItems.length]);

  // Reset validation state when dialog closes
  useEffect(() => {
    if (!open) {
      setInvalidListingIds(new Set());
      setHasValidated(false);
    }
  }, [open]);

  const validBuyItems = buyItems.filter(l => !invalidListingIds.has(l.listingId));
  const invalidBuyItems = buyItems.filter(l => invalidListingIds.has(l.listingId));
  const hasInvalidBuyItems = invalidBuyItems.length > 0;

  const handleExecuteClick = () => {
    if (hasInvalidBuyItems) {
      // Pass only valid buy items to execute
      onExecuteAll(validBuyItems);
    } else {
      onExecuteAll();
    }
  };

  const removeInvalidBuyItems = () => {
    for (const listing of invalidBuyItems) {
      onRemoveBuyItem(listing.listingId);
    }
  };

  // Group VALID buy items by payment token (exclude invalid ones from totals)
  const buyItemsByToken = validBuyItems.reduce((acc, listing) => {
    const tokenAddress = listing.paymentToken ?? 'default';
    if (!acc[tokenAddress]) {
      acc[tokenAddress] = [];
    }
    acc[tokenAddress].push(listing);
    return acc;
  }, {} as Record<string, Listing[]>);

  // Calculate totals per token for buy items with fee breakdown
  const tokenTotals = Object.entries(buyItemsByToken).map(([tokenAddress, tokenListings]) => {
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
              {isValidating && (
                <div className="text-center py-1 text-xs text-gray-400">
                  Validating listings...
                </div>
              )}
              {buyItems.map((listing) => {
                const isInvalid = invalidListingIds.has(listing.listingId);
                return (
                  <div
                    key={listing.listingId}
                    className={`flex items-center gap-3 p-3 rounded-lg transition-colors ${
                      isInvalid
                        ? "bg-red-900/20 border border-red-800/50 opacity-60"
                        : "bg-green-900/20 border border-green-800/50 hover:border-green-700"
                    }`}
                  >
                    {listing.beast?.image && (
                      <img
                        src={listing.beast.image}
                        alt={listing.beast.name}
                        className={`w-14 h-14 rounded object-cover ${isInvalid ? "grayscale" : ""}`}
                      />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className={`font-medium truncate text-sm ${isInvalid ? "text-gray-500" : ""}`}>
                          {listing.beast?.name || `Beast #${listing.tokenId}`}
                        </p>
                        {isInvalid && (
                          <span className="flex items-center gap-1 text-[10px] bg-red-500/20 text-red-400 px-2 py-0.5 rounded">
                            <AlertTriangle className="h-3 w-3" />
                            Unavailable
                          </span>
                        )}
                      </div>
                      <p className={`text-xs ${isInvalid ? "text-gray-500 line-through" : "text-green-400"}`}>
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
                      onClick={() => onRemoveBuyItem(listing.listingId)}
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
              {/* Invalid buy items warning */}
              {hasInvalidBuyItems && hasValidated && (
                <div className="rounded-md bg-red-500/10 border border-red-500/20 p-3 mb-3">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="h-4 w-4 text-red-400 mt-0.5 flex-shrink-0" />
                    <div className="flex-1">
                      <p className="text-sm text-red-300 font-medium">
                        {invalidBuyItems.length} purchase{invalidBuyItems.length > 1 ? 's' : ''} no longer available
                      </p>
                      <p className="text-xs text-red-400/80 mt-1">
                        {invalidBuyItems.length > 1 ? 'These items have' : 'This item has'} been sold or the seller no longer owns {invalidBuyItems.length > 1 ? 'them' : 'it'}.
                        {validBuyItems.length > 0 && ` You can continue with the ${validBuyItems.length} valid purchase${validBuyItems.length > 1 ? 's' : ''}.`}
                      </p>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={removeInvalidBuyItems}
                        className="mt-2 text-xs h-7 border-red-500/30 text-red-300 hover:bg-red-500/10"
                      >
                        Remove Unavailable Items
                      </Button>
                    </div>
                  </div>
                </div>
              )}

              <div className="flex justify-between text-sm">
                <span className="text-gray-400">Purchases:</span>
                <span className="font-medium">
                  {validBuyItems.length} items
                  {hasInvalidBuyItems && (
                    <span className="text-red-400 ml-1">
                      ({invalidBuyItems.length} unavailable)
                    </span>
                  )}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">Listings:</span>
                <span className="font-medium">{listBeasts.length} items</span>
              </div>
              {validBuyItems.length > 0 && (
                <div className="border-t border-gray-700 pt-2 space-y-2">
                  <p className="text-sm text-white font-semibold">Total to Pay:</p>
                  {tokenTotals.map((tokenTotal) => (
                    <div key={tokenTotal.tokenAddress} className="space-y-1">
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-400">Subtotal ({tokenTotal.tokenSymbol}):</span>
                        <span className="text-white">
                          {formatPrice(tokenTotal.subtotal, tokenTotal.tokenSymbol)}
                        </span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-400">Platform Fee (2%):</span>
                        <span className="text-gray-300">
                          {formatPrice(tokenTotal.fee, tokenTotal.tokenSymbol)}
                        </span>
                      </div>
                      <div className="flex justify-between text-sm font-semibold border-t border-gray-700 pt-1">
                        <span className="text-gray-300">Total ({tokenTotal.tokenSymbol}):</span>
                        <span className="text-green-400">
                          {formatPrice(tokenTotal.total, tokenTotal.tokenSymbol)}
                        </span>
                      </div>
                    </div>
                  ))}
                  <p className="text-[10px] text-gray-500 italic">
                    A 2% platform fee applies to each purchase. Each purchase uses the token specified in the listing.
                  </p>
                </div>
              )}
              {(validBuyItems.length > 0 || listBeasts.length > 0) && (
                <div className="rounded-md bg-blue-500/10 border border-blue-500/20 p-2.5">
                  <p className="text-xs text-blue-200">
                    ℹ️ All operations will be executed in a single transaction. This cannot be reversed.
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
                onClick={handleExecuteClick}
                disabled={isProcessing || isValidating || (validBuyItems.length === 0 && listBeasts.length === 0)}
                className="flex-1 bg-gradient-to-r from-green-600 to-amber-600 text-white hover:from-green-700 hover:to-amber-700"
              >
                {isProcessing
                  ? "Processing..."
                  : isValidating
                  ? "Validating..."
                  : validBuyItems.length === 0 && listBeasts.length === 0
                  ? "No Valid Items"
                  : `Execute All (${validBuyItems.length + listBeasts.length})`}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

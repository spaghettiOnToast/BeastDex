import { useMemo, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "../ui/dialog";
import { Button } from "../ui/button";
import type { OrderModel } from "@cartridge/arcade";
import { CategoryType, StatusType } from "@cartridge/arcade";
import { formatPrice } from "../../utils/price";
import { toBigIntSafe } from "../../utils/bigint";
import { getPaymentTokenByAddress } from "../../services/marketplace/constants";
import { useEkuboTokens, tokenAmountToUsd } from "../../hooks/useEkuboTokens";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tokenId: string;
  orders: OrderModel[];
  isOwner: boolean;
  isLoading?: boolean;
  onAcceptOffer?: (order: OrderModel) => void;
  isAccepting?: boolean;
};

export default function OffersDialog({
  open,
  onOpenChange,
  tokenId,
  orders,
  isOwner,
  isLoading,
  onAcceptOffer,
  isAccepting,
}: Props) {
  const { tokens } = useEkuboTokens();

  // Build token data map for USD calculations
  const tokenDataMap = useMemo(() => {
    const map = new Map<string, { decimals: number; usdPrice: number | null | undefined }>();
    for (const token of tokens) {
      map.set(token.address.toLowerCase(), {
        decimals: token.decimals,
        usdPrice: token.usdPrice,
      });
    }
    return map;
  }, [tokens]);

  // Get USD value for an offer
  const getOfferUsdValue = useCallback((order: OrderModel): number | null => {
    const tokenAddress = (order.currency ?? "0x0").toLowerCase();
    const tokenData = tokenDataMap.get(tokenAddress);
    if (!tokenData?.usdPrice) return null;
    try {
      const price = toBigIntSafe(order.price as any);
      return tokenAmountToUsd(price, tokenData.decimals, tokenData.usdPrice);
    } catch {
      return null;
    }
  }, [tokenDataMap]);

  const offers = useMemo(() => {
    if (!orders || orders.length === 0) return [];

    const now = Math.floor(Date.now() / 1000);

    return orders
      .filter(
        (order) =>
          order.category.value === CategoryType.Buy &&
          order.status.value === StatusType.Placed &&
          order.tokenId.toString() === tokenId &&
          (!order.expiration || order.expiration > now)
      )
      .sort((a, b) => {
        // Sort by price descending (highest first)
        const priceA = toBigIntSafe(a.price as any);
        const priceB = toBigIntSafe(b.price as any);
        if (priceA > priceB) return -1;
        if (priceA < priceB) return 1;
        return 0;
      });
  }, [orders, tokenId]);

  const formatOfferPrice = (order: OrderModel) => {
    const token = getPaymentTokenByAddress(order.currency);
    const symbol = token?.symbol ?? "STRK";
    return formatPrice(order.price, symbol);
  };

  const formatAddress = (address: string) => {
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  const formatExpiration = (expiration: number) => {
    const date = new Date(expiration * 1000);
    const now = new Date();
    const diff = date.getTime() - now.getTime();
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const days = Math.floor(hours / 24);

    if (days > 1) return `Expires in ${days} days`;
    if (hours > 1) return `Expires in ${hours} hours`;
    return `Expires ${date.toLocaleString()}`;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-surface-overlay border border-white/[0.06] max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Offers on Beast #{tokenId}</DialogTitle>
          <DialogDescription>
            {isLoading
              ? "Loading offers..."
              : offers.length === 0
              ? "No active offers on this beast yet."
              : isOwner
              ? "Review and accept offers from potential buyers."
              : "View active offers from other users."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {isLoading ? (
            <p className="text-sm text-zinc-400 text-center py-8">
              Loading offers...
            </p>
          ) : offers.length === 0 ? (
            <p className="text-sm text-zinc-400 text-center py-8">
              No offers yet. Be the first to make an offer!
            </p>
          ) : (
            offers.map((offer, index) => {
              const usdValue = getOfferUsdValue(offer);
              return (
                <div
                  key={`${offer.id}-${index}`}
                  className="flex items-center justify-between p-4 rounded-lg border border-white/[0.06] bg-surface-raised/50"
                >
                  <div className="flex-1 space-y-1">
                    <div className="flex items-center gap-3">
                      <span className="text-lg font-semibold text-gold">
                        {formatOfferPrice(offer)}
                      </span>
                      {usdValue !== null && (
                        <span className="text-sm text-zinc-400">${usdValue.toFixed(2)}</span>
                      )}
                      {index === 0 && (
                        <span className="text-xs bg-gold/15 text-gold px-2 py-0.5 rounded">
                          Highest
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-xs text-zinc-400">
                      <span>From: {formatAddress(offer.owner)}</span>
                      {offer.expiration && (
                        <>
                          <span>•</span>
                          <span>{formatExpiration(offer.expiration)}</span>
                        </>
                      )}
                    </div>
                  </div>

                  {isOwner && onAcceptOffer && (
                    <Button
                      size="sm"
                      onClick={() => onAcceptOffer(offer)}
                      disabled={isAccepting}
                      className="bg-gold text-black hover:bg-gold/90"
                    >
                      {isAccepting ? "Accepting..." : "Accept"}
                    </Button>
                  )}
                </div>
              );
            })
          )}
        </div>

        <div className="flex justify-end mt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

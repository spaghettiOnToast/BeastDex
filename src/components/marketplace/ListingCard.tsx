import { memo } from "react";
import { Card, CardContent, CardFooter } from "../ui/card";
import { Button } from "../ui/button";
import type { Beast } from "../../services/beast";
import { LazyImage } from "../ui/LazyImage";
import type { ListingStatus } from "../../services/marketplace/types";
import TokenIcon from "../ui/TokenIcon";

type Props = {
  beast?: Beast | null;
  tokenId?: string;
  priceLabel?: string;
  subtitlePriceLabel?: string;
  tokenLogoUrl?: string | null;
  onBuy?: () => void; // Kept for backwards compatibility - maps to Buy Now
  onBuyNow?: () => void; // Immediate purchase
  onAddToCart?: () => void; // Add to cart
  onMakeOffer?: () => void;
  onViewOffers?: () => void;
  onEdit?: () => void;
  onCancel?: () => void;
  onCardClick?: () => void; // Click on card image to show details
  ownedByUser?: boolean;
  compact?: boolean;
  primaryActionLabel?: string;
  secondaryActionLabel?: string;
  inCart?: boolean;
  offersCount?: number;
  buyDisabled?: boolean;
  pendingCancel?: boolean;
  status?: ListingStatus;
  isAlreadyListed?: boolean;
};

function ListingCard({
  beast,
  tokenId,
  priceLabel,
  subtitlePriceLabel,
  tokenLogoUrl,
  onBuy,
  onBuyNow,
  onAddToCart,
  onMakeOffer,
  onViewOffers,
  onEdit,
  onCancel,
  onCardClick,
  ownedByUser = false,
  compact = false,
  primaryActionLabel,
  secondaryActionLabel,
  inCart = false,
  offersCount = 0,
  buyDisabled = false,
  pendingCancel = false,
  status,
  isAlreadyListed = false,
}: Props) {
  // For backwards compatibility, if onBuy is provided but not onBuyNow/onAddToCart, use onBuy as Buy Now
  const handleBuyNow = onBuyNow || onBuy;
  const handleAddToCart = onAddToCart;
  const displayName = beast?.name ?? (tokenId ? `Beast #${tokenId}` : "Unknown Beast");
  const imageSrc = beast?.image;

  const getStatusBadge = () => {
    if (!status || status === 'active') return null;

    const configs = {
      expired: { bg: 'bg-orange-500/20', border: 'border-orange-400/50', text: 'EXPIRED', textColor: 'text-orange-300' },
      cancelled: { bg: 'bg-gray-500/20', border: 'border-gray-400/50', text: 'CANCELLED', textColor: 'text-gray-300' },
      sold: { bg: 'bg-green-500/20', border: 'border-green-400/50', text: 'SOLD', textColor: 'text-green-300' },
    };

    const config = configs[status];
    if (!config) return null;

    return (
      <div className={`flex items-center justify-center w-full ${config.bg} backdrop-blur-sm border ${config.border} rounded px-2 py-1.5`}>
        <p className={`text-[10px] font-bold uppercase tracking-wider ${config.textColor}`}>{config.text}</p>
      </div>
    );
  };

  return (
    <Card
      className={[
        "group w-full overflow-hidden border border-gray-800/50 bg-gradient-to-br from-black/40 to-gray-900/20 backdrop-blur-sm transition-all duration-300 hover:border-lsGold/30 hover:shadow-xl hover:shadow-lsGold/10 hover:-translate-y-1",
        compact ? "max-w-[220px]" : "max-w-[280px]",
      ].join(" ")}
    >
      <CardContent className="p-0">
        <div
          className={[
            "relative bg-gradient-to-br from-gray-900/50 to-black/50 rounded-t-lg overflow-hidden",
            compact ? "aspect-[4/5]" : "aspect-square",
            onCardClick ? "cursor-pointer hover:opacity-90 transition-opacity" : "",
          ].join(" ")}
          onClick={onCardClick}
          onKeyDown={onCardClick ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onCardClick(); } } : undefined}
          role={onCardClick ? "button" : undefined}
          tabIndex={onCardClick ? 0 : undefined}
        >
          {imageSrc ? (
            <LazyImage
              src={imageSrc}
              alt={displayName}
              className="object-contain w-full h-full"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-muted-foreground text-sm">
              No image
            </div>
          )}
          {offersCount > 0 && (
            <div className="absolute top-3 right-3 bg-gradient-to-r from-lsGold/30 to-yellow-600/30 backdrop-blur-md border border-lsGold/60 rounded-lg px-3 py-1.5 shadow-lg">
              <p className="text-xs font-bold text-lsGold">
                {offersCount} {offersCount === 1 ? "Offer" : "Offers"}
              </p>
            </div>
          )}
        </div>
      </CardContent>
      <CardFooter className="flex flex-col gap-2 p-3 bg-gradient-to-br from-black/30 to-gray-900/20">
        {/* Status Badge */}
        {getStatusBadge()}

        {/* Price Section */}
        {(priceLabel || subtitlePriceLabel) && (
          <div className="flex items-center justify-center gap-1.5 w-full">
            {priceLabel && (
              <div className="flex items-center gap-1">
                <span className="text-sm font-bold text-lsGold">
                  {priceLabel.split(' ')[0]}
                </span>
                <TokenIcon
                  symbol={priceLabel.split(' ').slice(1).join(' ')}
                  size="sm"
                  logoUrl={tokenLogoUrl}
                />
              </div>
            )}
            {subtitlePriceLabel && (
              <span className="text-xs text-gray-400">
                ${subtitlePriceLabel.split(' ')[0]}
              </span>
            )}
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex flex-col items-center justify-center gap-2 w-full">
          {ownedByUser ? (
            <div className="flex items-center justify-center gap-1.5 w-full">
              {isAlreadyListed ? (
                <div className="flex-1 text-[10px] px-2 py-1 h-7 bg-orange-500/20 text-orange-300 border border-orange-400/50 rounded-md flex items-center justify-center font-semibold">
                  Already Listed
                </div>
              ) : (
                <Button
                  className={
                    inCart
                      ? "flex-1 text-[10px] px-2 py-1 h-7 bg-[#39ff14] text-black hover:bg-[#39ff14]/90 border-[#39ff14] font-semibold"
                      : "flex-1 text-[10px] px-2 py-1 h-7 font-semibold hover:bg-gray-800/50 border-white text-white"
                  }
                  variant={inCart ? "default" : "outline"}
                  onClick={onEdit}
                  disabled={pendingCancel}
                >
                  {pendingCancel ? "Cancelling…" : (primaryActionLabel ?? "Edit")}
                </Button>
              )}
              {onCancel && !pendingCancel ? (
                <Button
                  className="flex-1 text-[10px] px-2 py-1 h-7 font-semibold"
                  variant="destructive"
                  onClick={onCancel}
                >
                  {secondaryActionLabel ?? "Cancel"}
                </Button>
              ) : null}
            </div>
          ) : (
            <div className="flex items-center justify-center gap-1 w-full">
              {/* Buy Now button */}
              {handleBuyNow && (
                <Button
                  className={[
                    "flex-1 font-semibold text-[9px] px-1.5 py-1 h-6 transition-all",
                    buyDisabled
                      ? "bg-gray-800 text-gray-400 cursor-not-allowed border-gray-600"
                      : "bg-lsGold/20 text-lsGold border-lsGold hover:bg-lsGold/30 hover:border-lsGold/80",
                  ].join(" ")}
                  variant="outline"
                  onClick={handleBuyNow}
                  disabled={buyDisabled}
                >
                  {buyDisabled ? "Unavailable" : "Buy"}
                </Button>
              )}

              {/* Add to Cart */}
              {handleAddToCart && (
                isAlreadyListed ? (
                  <div className="flex-1 text-[9px] px-1.5 py-1 h-6 bg-green-500/20 text-green-300 border border-green-400/50 rounded-md flex items-center justify-center font-semibold">
                    Listed
                  </div>
                ) : (
                  <Button
                    className={[
                      "flex-1 text-[9px] px-1.5 py-1 h-6",
                      buyDisabled
                        ? "bg-gray-800 text-gray-400 cursor-not-allowed border-gray-600"
                        : inCart
                        ? "bg-[#39ff14]/20 text-[#39ff14] border-[#39ff14] font-semibold"
                        : "border-lsGold text-lsGold hover:bg-lsGold/10 hover:border-lsGold font-semibold",
                    ].join(" ")}
                    variant="outline"
                    onClick={handleAddToCart}
                    disabled={buyDisabled}
                  >
                    {inCart ? "In Cart" : "Cart"}
                  </Button>
                )
              )}

              {/* Make Offer */}
              {onMakeOffer && (
                <Button
                  className="flex-1 border-white text-white hover:bg-gray-800/50 hover:border-white font-semibold transition-all text-[9px] px-1.5 py-1 h-6"
                  variant="outline"
                  onClick={onMakeOffer}
                >
                  Offer
                </Button>
              )}
            </div>
          )}
        </div>
        {ownedByUser && onViewOffers && offersCount > 0 && (
          <Button
            className="w-full text-[10px] px-2 py-1 h-7 border-lsGold/50 text-lsGold hover:bg-lsGold/10 hover:border-lsGold font-semibold transition-all"
            variant="outline"
            onClick={onViewOffers}
          >
            View {offersCount} {offersCount === 1 ? "Offer" : "Offers"}
          </Button>
        )}
      </CardFooter>
    </Card>
  );
}

// Memoize to prevent unnecessary re-renders when parent updates
export default memo(ListingCard);

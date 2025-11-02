import { Card, CardContent, CardFooter } from "../ui/card";
import { Button } from "../ui/button";
import type { Beast } from "../../services/beast";
import { LazyImage } from "../ui/LazyImage";
import type { ListingStatus } from "../../services/marketplace/types";

type Props = {
  beast?: Beast | null;
  tokenId?: string;
  priceLabel?: string;
  subtitlePriceLabel?: string;
  onBuy?: () => void;
  onMakeOffer?: () => void;
  onViewOffers?: () => void;
  onEdit?: () => void;
  onCancel?: () => void;
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

export default function ListingCard({
  beast,
  tokenId,
  priceLabel,
  subtitlePriceLabel,
  onBuy,
  onMakeOffer,
  onViewOffers,
  onEdit,
  onCancel,
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
  const displayName = beast?.name ?? (tokenId ? `Beast #${tokenId}` : "Unknown Beast");
  const imageSrc = beast?.image;

  const getStatusBadge = () => {
    if (!status || status === 'active') return null;

    const configs = {
      expired: { bg: 'bg-orange-500/20', border: 'border-orange-400/50', text: 'EXPIRED', textColor: 'text-orange-300' },
      canceled: { bg: 'bg-gray-500/20', border: 'border-gray-400/50', text: 'CANCELED', textColor: 'text-gray-300' },
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
          ].join(" ")}
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
      <CardFooter className="flex flex-col gap-2 p-3 bg-gradient-to-br from-black/30 to-gray-900/20 min-h-[120px]">
        {/* Beast Name */}
        <div className="flex items-center justify-center w-full">
          <div className="text-base font-semibold truncate text-center text-white group-hover:text-lsGold transition-colors">
            {displayName}
          </div>
        </div>

        {/* Price Section - Single Line */}
        {(priceLabel || subtitlePriceLabel) && (
          <div className="flex items-center justify-center gap-2 w-full">
            {priceLabel && (
              <p className="text-sm font-bold text-lsGold">{priceLabel}</p>
            )}
            {subtitlePriceLabel && (
              <>
                <span className="text-xs text-gray-500">=</span>
                <p className="text-xs text-gray-400">{subtitlePriceLabel}</p>
              </>
            )}
          </div>
        )}

        {/* Status Badge */}
        {getStatusBadge()}

        {/* Spacer to push buttons to bottom */}
        <div className="flex-1" />

        {/* Action Buttons */}
        <div className="flex items-center justify-center gap-2 w-full">
          {ownedByUser ? (
            <>
              <Button
                className={
                  isAlreadyListed
                    ? "flex-1 text-xs px-3 py-2 h-9 bg-orange-500/20 text-orange-300 border-orange-400/50 cursor-not-allowed font-semibold"
                    : inCart
                    ? "flex-1 text-xs px-3 py-2 h-9 bg-[#39ff14] text-black hover:bg-[#39ff14]/90 border-[#39ff14] font-semibold"
                    : "flex-1 text-xs px-3 py-2 h-9 font-semibold hover:bg-gray-800/50 border-white text-white"
                }
                variant={inCart ? "default" : "outline"}
                onClick={onEdit}
                disabled={pendingCancel || isAlreadyListed}
              >
                {pendingCancel ? "Cancelling…" : isAlreadyListed ? "Already Listed" : (primaryActionLabel ?? "Edit")}
              </Button>
              {onCancel && !pendingCancel ? (
                <Button
                  className="flex-1 text-xs px-3 py-2 h-9 font-semibold"
                  variant="destructive"
                  onClick={onCancel}
                >
                  {secondaryActionLabel ?? "Cancel"}
                </Button>
              ) : null}
            </>
          ) : (
            <>
              <Button
                className={[
                  "flex-1 font-bold text-xs px-2 py-2 h-9",
                  buyDisabled
                    ? "bg-gray-800 text-gray-400 cursor-not-allowed"
                    : "bg-lsGold text-white border-white hover:bg-lsGold/90 shadow-lg shadow-lsGold/20 transition-all hover:shadow-lsGold/30 hover:scale-105",
                ].join(" ")}
                onClick={onBuy}
                disabled={buyDisabled}
              >
                {primaryActionLabel ?? (buyDisabled ? "Unavailable" : "Buy")}
              </Button>
              {onMakeOffer && (
                <Button
                  className="flex-1 border-white text-white hover:bg-gray-800/50 hover:border-white font-semibold transition-all text-xs px-2 py-2 h-9"
                  variant="outline"
                  onClick={onMakeOffer}
                >
                  Offer
                </Button>
              )}
            </>
          )}
        </div>
        {ownedByUser && onViewOffers && offersCount > 0 && (
          <Button
            className="w-full text-xs px-3 py-2 h-9 border-lsGold/50 text-lsGold hover:bg-lsGold/10 hover:border-lsGold font-semibold transition-all"
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

import { Card, CardContent, CardFooter } from "../ui/card";
import { Button } from "../ui/button";
import type { Beast } from "../../services/beast";
import { LazyImage } from "../ui/LazyImage";

type Props = {
  beast?: Beast | null;
  tokenId?: string;
  priceLabel?: string;
  onBuy?: () => void;
  onEdit?: () => void;
  onCancel?: () => void;
  ownedByUser?: boolean;
  compact?: boolean;
  primaryActionLabel?: string;
  secondaryActionLabel?: string;
};

export default function ListingCard({
  beast,
  tokenId,
  priceLabel,
  onBuy,
  onEdit,
  onCancel,
  ownedByUser = false,
  compact = false,
  primaryActionLabel,
  secondaryActionLabel,
}: Props) {
  const displayName = beast?.name ?? (tokenId ? `Beast #${tokenId}` : "Unknown Beast");
  const imageSrc = beast?.image;

  return (
    <Card
      className={[
        "w-full overflow-hidden border-0 bg-card/50 backdrop-blur-sm",
        compact ? "max-w-[220px]" : "max-w-[280px]",
      ].join(" ")}
    >
      <CardContent className="p-0">
        <div
          className={[
            "relative bg-gradient-to-br from-secondary/20 to-background rounded-t-lg overflow-hidden",
            compact ? "aspect-[4/5]" : "aspect-square",
          ].join(" ")}
        >
          {imageSrc ? (
            <LazyImage src={imageSrc} alt={displayName} className="object-contain w-full h-full" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-muted-foreground text-sm">
              No image
            </div>
          )}
          {priceLabel && (
            <div className="absolute top-2 left-2 bg-black/80 border border-gray-800 rounded px-2 py-1 text-xs">
              {priceLabel}
            </div>
          )}
        </div>
      </CardContent>
      <CardFooter className="flex flex-col gap-2 p-3">
        <div className="flex items-center justify-between w-full">
          <div className="text-sm font-medium truncate">{displayName}</div>
        </div>
        <div className="flex items-center gap-2 w-full">
          {ownedByUser ? (
            <>
              <Button className="flex-1" variant="outline" onClick={onEdit}>
                {primaryActionLabel ?? "Edit"}
              </Button>
              {onCancel ? (
                <Button className="flex-1" variant="destructive" onClick={onCancel}>
                  {secondaryActionLabel ?? "Cancel"}
                </Button>
              ) : null}
            </>
          ) : (
            <Button className="w-full" onClick={onBuy}>
              {primaryActionLabel ?? "Buy"}
            </Button>
          )}
        </div>
      </CardFooter>
    </Card>
  );
}

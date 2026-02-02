import { memo } from "react";
import { Link } from "react-router-dom";
import type { Beast } from "../../services/beast";
import { LazyImage } from "../ui/LazyImage";
import { Card, CardContent, CardFooter } from "../ui/card";
import { Badge } from "../ui/badge";
import { cn } from "@/lib/utils";

type Props = {
  beast: Beast;
  owned?: boolean;
  ownerUsername?: string | null;
  onSelect?: (beast: Beast) => void;
  missing?: boolean;
  overlayLabel?: string;
  disabled?: boolean;
  duplicateCount?: number;
  hasAllVariants?: boolean;
};

const BeastCard = memo(function BeastCard({
  beast,
  owned,
  ownerUsername,
  onSelect,
  missing = false,
  overlayLabel = "Need to hunt",
  disabled = false,
  duplicateCount,
  hasAllVariants = false,
}: Props) {
  const { image, name, owner } = beast;

  const renderOwner = () => {
    if (missing) {
      return (
        <Badge
          variant="secondary"
          className="text-xs font-normal w-full justify-center"
        >
          {overlayLabel}
        </Badge>
      );
    }

    if (!owned || !owner) {
      return (
        <Badge
          variant="outline"
          className="text-xs font-normal w-full justify-center"
        >
          Unowned
        </Badge>
      );
    }

    const address = owner.toLowerCase();
    
    // Check if ownerUsername is actually a truncated address (not a real username)
    const isRealUsername = ownerUsername && !ownerUsername.match(/^0x[a-fA-F0-9]{4}\.{3}[a-fA-F0-9]{4}$/);
    
    const label = isRealUsername
      ? ownerUsername
      : `${owner.slice(0, 6)}…${owner.slice(-4)}`;
      
    const accountIdentifier = isRealUsername
      ? ownerUsername.trim().toLowerCase()
      : address;

    return (
      <div className="flex items-center justify-center gap-1 text-xs">
        <span className="text-muted-foreground text-xs">Owner:</span>
        <Link
          to={`/collection/${encodeURIComponent(accountIdentifier)}`}
          className="text-primary hover:text-primary/80 font-medium underline underline-offset-2 decoration-primary/50 hover:decoration-primary transition-all truncate text-xs"
          onClick={(event) => event.stopPropagation()}
        >
          {label}
        </Link>
      </div>
    );
  };

  return (
    <Card
      className={cn(
        "w-full max-w-[180px] sm:max-w-[220px] md:max-w-[280px] overflow-hidden cursor-pointer transition-all duration-300 group border-0 ring-0 hover:ring-0",
        "hover:shadow-2xl hover:-translate-y-1",
        "bg-card/50 backdrop-blur-sm",
        missing && "opacity-50 cursor-not-allowed",
        disabled && "pointer-events-none opacity-50"
      )}
      onClick={() => {
        if (!disabled && !missing) {
          onSelect?.(beast);
        }
      }}
    >
      <CardContent className="p-0">
        <div className="relative aspect-square bg-gradient-to-br from-secondary/20 to-background rounded-t-lg overflow-hidden">
          {image ? (
            <LazyImage
              src={image}
              alt={name}
              className="object-contain w-full h-full"
              placeholder="No image"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-muted-foreground text-sm">
              No image
            </div>
          )}
          {duplicateCount && duplicateCount > 1 && !missing && (
            <div className="absolute top-2 right-2 bg-primary text-primary-foreground rounded-full w-5 h-5 sm:w-6 sm:h-6 flex items-center justify-center text-[10px] sm:text-xs font-bold shadow-lg border border-primary/20">
              {duplicateCount}
            </div>
          )}
          {missing && (
            <div className="absolute inset-0 flex items-center justify-center bg-background/90 backdrop-blur-sm">
              <Badge
                variant="outline"
                className="px-4 py-1.5 text-xs font-semibold uppercase tracking-widest border-2"
              >
                {overlayLabel}
              </Badge>
            </div>
          )}
        </div>
      </CardContent>
      <CardFooter className="flex flex-col items-center gap-1 sm:gap-1.5 px-1 sm:px-0 py-2 sm:py-3 bg-gradient-to-b from-background/50 to-background">
        <p className={cn(
          "font-medium text-xs sm:text-sm truncate w-full text-center transition-all duration-300",
          hasAllVariants && !missing && "text-[#39ff14] drop-shadow-[0_0_8px_rgba(57,255,20,0.8)] animate-pulse"
        )}>
          {name}
        </p>
        <div className="w-full text-center text-[10px] sm:text-xs">{renderOwner()}</div>
      </CardFooter>
    </Card>
  );
});

export default BeastCard;

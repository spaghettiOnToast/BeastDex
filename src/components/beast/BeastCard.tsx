import { memo } from "react";
import { Link } from "react-router-dom";
import type { Beast } from "../../services/beast";
import { LazyImage } from "../ui/LazyImage";
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

    const isRealUsername = ownerUsername && !ownerUsername.match(/^0x[a-fA-F0-9]{4}\.{3}[a-fA-F0-9]{4}$/);

    const label = isRealUsername
      ? ownerUsername
      : `${owner.slice(0, 6)}...${owner.slice(-4)}`;

    const accountIdentifier = isRealUsername
      ? ownerUsername.trim().toLowerCase()
      : address;

    return (
      <div className="flex items-center justify-center gap-1 text-xs">
        <span className="text-zinc-500 text-xs">Owner:</span>
        <Link
          to={`/collection/${encodeURIComponent(accountIdentifier)}`}
          className="text-accent hover:text-accent-hover font-medium truncate text-xs transition-colors"
          onClick={(event) => event.stopPropagation()}
        >
          {label}
        </Link>
      </div>
    );
  };

  return (
    <div
      className={cn(
        "w-full max-w-[180px] sm:max-w-[220px] md:max-w-[280px] overflow-hidden cursor-pointer transition-all duration-200 group rounded-xl border border-white/[0.06] bg-surface-raised",
        "hover:border-white/[0.12] hover:-translate-y-0.5",
        missing && "opacity-50 cursor-not-allowed",
        disabled && "pointer-events-none opacity-50"
      )}
      onClick={() => {
        if (!disabled && !missing) {
          onSelect?.(beast);
        }
      }}
    >
      <div className="relative aspect-square bg-white/[0.02] rounded-t-xl overflow-hidden">
        {image ? (
          <LazyImage
            src={image}
            alt={name}
            className="object-contain w-full h-full"
            placeholder="No image"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-zinc-600 text-sm">
            No image
          </div>
        )}
        {duplicateCount && duplicateCount > 1 && !missing && (
          <div className="absolute top-2 right-2 bg-accent text-white rounded-full w-5 h-5 sm:w-6 sm:h-6 flex items-center justify-center text-[10px] sm:text-xs font-bold shadow-sm">
            {duplicateCount}
          </div>
        )}
        {missing && (
          <div className="absolute inset-0 flex items-center justify-center bg-surface/90 backdrop-blur-sm">
            <Badge
              variant="outline"
              className="px-4 py-1.5 text-xs font-semibold uppercase tracking-widest border-2"
            >
              {overlayLabel}
            </Badge>
          </div>
        )}
      </div>
      <div className="flex flex-col items-center gap-1 sm:gap-1.5 px-1 sm:px-2 py-2 sm:py-3">
        <p className={cn(
          "font-medium text-xs sm:text-sm truncate w-full text-center transition-colors",
          hasAllVariants && !missing && "text-accent"
        )}>
          {name}
        </p>
        <div className="w-full text-center text-[10px] sm:text-xs">{renderOwner()}</div>
      </div>
    </div>
  );
});

export default BeastCard;

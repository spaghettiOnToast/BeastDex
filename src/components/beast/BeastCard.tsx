import { memo } from "react";
import { Link } from "react-router-dom";
import type { Beast, BeastAttribute } from "../../services/beast";
import { LazyImage } from "../ui/LazyImage";
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

function getAttr(attributes: BeastAttribute[], trait: string): string | number | null {
  const found = attributes.find(
    (a) => a.trait_type.toLowerCase() === trait.toLowerCase()
  );
  return found?.value ?? null;
}

function tierColor(tier: number | null): string {
  switch (tier) {
    case 1: return "text-yellow-400";
    case 2: return "text-purple-400";
    case 3: return "text-blue-400";
    case 4: return "text-green-400";
    case 5: return "text-zinc-400";
    default: return "text-zinc-500";
  }
}

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
  const { image, name, owner, attributes, numericId, power } = beast;

  const tier = getAttr(attributes, "Tier");
  const level = getAttr(attributes, "Level");
  const type = getAttr(attributes, "Type");
  const health = getAttr(attributes, "Health");
  const rank = getAttr(attributes, "Rank");
  const isShiny = getAttr(attributes, "Shiny");
  const isAnimated = getAttr(attributes, "Animated");

  const shiny = isShiny === "true" || isShiny === 1 || isShiny === "1";
  const animated = isAnimated === "true" || isAnimated === 1 || isAnimated === "1";

  const renderOwner = () => {
    if (missing) return null;
    if (!owned || !owner) return null;

    const address = owner.toLowerCase();
    const isRealUsername =
      ownerUsername && !ownerUsername.match(/^0x[a-fA-F0-9]{4}\.{3}[a-fA-F0-9]{4}$/);
    const label = isRealUsername
      ? ownerUsername
      : `${owner.slice(0, 6)}...${owner.slice(-4)}`;
    const accountIdentifier = isRealUsername
      ? ownerUsername.trim().toLowerCase()
      : address;

    return (
      <div className="flex items-center justify-center gap-1 text-[10px]">
        <span className="text-zinc-600">Owner:</span>
        <Link
          to={`/collection/${encodeURIComponent(accountIdentifier)}`}
          className="text-accent hover:text-accent-hover font-medium truncate transition-colors"
          onClick={(e) => e.stopPropagation()}
        >
          {label}
        </Link>
      </div>
    );
  };

  return (
    <div
      className={cn(
        "w-full overflow-hidden cursor-pointer transition-all duration-200 group rounded-xl border border-white/[0.06] bg-surface-raised flex flex-col",
        "hover:border-white/[0.14] hover:-translate-y-0.5 hover:shadow-lg",
        missing && "opacity-50 cursor-not-allowed",
        disabled && "pointer-events-none opacity-50",
        shiny && !animated && "border-yellow-500/20 hover:border-yellow-500/40",
        animated && !shiny && "border-purple-500/20 hover:border-purple-500/40",
        shiny && animated && "border-accent/25 hover:border-accent/50",
      )}
      onClick={() => {
        if (!disabled && !missing) onSelect?.(beast);
      }}
    >
      {/* Header: token ID + rank */}
      <div className="flex items-center justify-between px-2 pt-2 pb-0.5">
        <span className="text-[10px] text-zinc-600 font-mono">#{numericId}</span>
        <div className="flex items-center gap-1">
          {(shiny || animated) && (
            <span className={cn(
              "text-[9px] font-semibold px-1 rounded",
              shiny && animated ? "text-accent bg-accent/10" :
              shiny ? "text-yellow-400 bg-yellow-400/10" :
              "text-purple-400 bg-purple-400/10"
            )}>
              {shiny && animated ? "✦ A.SHINY" : shiny ? "✦ SHINY" : "✦ ANIM"}
            </span>
          )}
          {rank != null && (
            <span className="text-[10px] text-zinc-500">
              <span className="text-zinc-600">R</span>{rank}
            </span>
          )}
        </div>
      </div>

      {/* Image */}
      <div className="relative aspect-square bg-white/[0.02] overflow-hidden mx-2 rounded-lg">
        {image ? (
          <LazyImage
            src={image}
            alt={name}
            className="object-contain w-full h-full"
            placeholder="No image"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-zinc-600 text-xs">
            No image
          </div>
        )}
        {duplicateCount && duplicateCount > 1 && !missing && (
          <div className="absolute top-1.5 right-1.5 bg-accent text-white rounded-full w-5 h-5 flex items-center justify-center text-[10px] font-bold">
            {duplicateCount}
          </div>
        )}
        {missing && (
          <div className="absolute inset-0 flex items-center justify-center bg-surface/90 backdrop-blur-sm rounded-lg">
            <span className="text-xs font-semibold uppercase tracking-widest text-zinc-400 border border-white/10 px-3 py-1 rounded">
              {overlayLabel}
            </span>
          </div>
        )}
      </div>

      {/* Name */}
      <div className="px-2 pt-1.5">
        <p className={cn(
          "font-semibold text-xs truncate text-center leading-tight",
          hasAllVariants && !missing ? "text-accent" : "text-white"
        )}>
          {name}
        </p>
      </div>

      {/* Tier / Level / Type row */}
      <div className="grid grid-cols-3 gap-px mx-2 mt-1.5 rounded-lg overflow-hidden bg-white/[0.04]">
        <div className="flex flex-col items-center py-1.5 bg-surface-raised">
          <span className="text-[9px] uppercase tracking-widest text-zinc-600 leading-none mb-0.5">Tier</span>
          <span className={cn("text-xs font-bold leading-none", tierColor(Number(tier)))}>{tier ?? "—"}</span>
        </div>
        <div className="flex flex-col items-center py-1.5 bg-surface-raised">
          <span className="text-[9px] uppercase tracking-widest text-zinc-600 leading-none mb-0.5">Level</span>
          <span className="text-xs font-bold leading-none text-white">{level ?? "—"}</span>
        </div>
        <div className="flex flex-col items-center py-1.5 bg-surface-raised">
          <span className="text-[9px] uppercase tracking-widest text-zinc-600 leading-none mb-0.5">Type</span>
          <span className="text-xs font-bold leading-none text-white">{type ?? "—"}</span>
        </div>
      </div>

      {/* Power / Health row */}
      <div className="grid grid-cols-2 gap-px mx-2 mt-px mb-2 rounded-lg overflow-hidden bg-white/[0.04]">
        <div className="flex flex-col items-center py-1.5 bg-surface-raised">
          <span className="text-[9px] uppercase tracking-widest text-zinc-600 leading-none mb-0.5">Power</span>
          <div className="flex items-center gap-0.5">
            <span className="text-xs font-bold leading-none text-white">{power ?? "—"}</span>
            <span className="text-yellow-400 text-[10px]">⚡</span>
          </div>
        </div>
        <div className="flex flex-col items-center py-1.5 bg-surface-raised">
          <span className="text-[9px] uppercase tracking-widest text-zinc-600 leading-none mb-0.5">Health</span>
          <div className="flex items-center gap-0.5">
            <span className="text-xs font-bold leading-none text-white">{health ?? "—"}</span>
            <span className="text-red-400 text-[10px]">♥</span>
          </div>
        </div>
      </div>

      {/* Owner */}
      {renderOwner() && (
        <div className="pb-2 px-2 text-center">{renderOwner()}</div>
      )}
    </div>
  );
});

export default BeastCard;

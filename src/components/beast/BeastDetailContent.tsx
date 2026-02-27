import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import type { Beast, BeastAttribute } from "../../services/beast";
import type { SummitBeastData } from "../../services/summit";
import CometCard from "../ui/CometCard";
import SummitStats from "./SummitStats";
import { cn } from "../../lib/utils";

type BeastDetailContentProps = {
  beast: Beast;
  ownerUsername?: string | null;
  actionSlot?: ReactNode;
  summitData?: SummitBeastData | null;
  summitLoading?: boolean;
  hideFooter?: boolean;
};

const BOOLEAN_ATTRIBUTES = new Set(["shiny", "animated", "genesis"]);
const UNIX_TIMESTAMP_ATTRIBUTES = new Set(["last death timestamp"]);

type RightPanelTab = "summit" | "metadata";

// Color mapping for different attribute types
const getAttributeStyle = (trait: string | undefined) => {
  if (!trait)
    return {
      bg: "bg-white/[0.06]",
      border: "border-white/[0.08]",
      text: "text-zinc-300",
    };
  const t = trait.toLowerCase();

  if (t === "tier")
    return {
      bg: "bg-yellow-500/10",
      border: "border-yellow-500/30",
      text: "text-yellow-300",
    };
  if (t === "level")
    return {
      bg: "bg-blue-500/10",
      border: "border-blue-500/30",
      text: "text-blue-300",
    };
  if (t === "type")
    return {
      bg: "bg-purple-500/10",
      border: "border-purple-500/30",
      text: "text-purple-300",
    };
  if (t === "power")
    return {
      bg: "bg-orange-500/10",
      border: "border-orange-500/30",
      text: "text-orange-300",
    };
  if (t === "health")
    return {
      bg: "bg-pink-500/10",
      border: "border-pink-500/30",
      text: "text-pink-300",
    };
  if (t === "rank")
    return {
      bg: "bg-emerald-500/10",
      border: "border-emerald-500/30",
      text: "text-emerald-300",
    };
  if (t === "prefix" || t === "suffix")
    return {
      bg: "bg-cyan-500/10",
      border: "border-cyan-500/30",
      text: "text-cyan-300",
    };
  if (t === "adventurers killed")
    return {
      bg: "bg-red-500/10",
      border: "border-red-500/30",
      text: "text-red-300",
    };
  if (t === "shiny" || t === "animated" || t === "genesis")
    return {
      bg: "bg-[#22c55e]/10",
      border: "border-[#22c55e]/30",
      text: "text-[#22c55e]",
    };

  return {
    bg: "bg-white/[0.06]",
    border: "border-white/[0.08]",
    text: "text-zinc-300",
  };
};

export function BeastDetailContent({
  beast,
  ownerUsername,
  actionSlot,
  summitData,
  summitLoading,
  hideFooter = false,
}: BeastDetailContentProps) {
  const [rightPanelTab, setRightPanelTab] = useState<RightPanelTab>("metadata");
  const attributes = Array.isArray(beast.attributes) ? beast.attributes : [];

  const ownerAddressLower = beast.owner ? beast.owner.toLowerCase() : "";
  const accountIdentifier = ownerUsername
    ? ownerUsername.trim().toLowerCase()
    : ownerAddressLower;

  const ownerLabel = ownerUsername
    ? ownerUsername
    : beast.owner
      ? `${beast.owner.slice(0, 6)}…${beast.owner.slice(-4)}`
      : "";

  const formatAttributeValue = (
    trait: string | undefined,
    value: BeastAttribute["value"],
  ) => {
    if (!trait) return String(value);
    const t = trait.toLowerCase();

    if (BOOLEAN_ATTRIBUTES.has(t)) {
      if (value === "1" || value === 1) return "Yes";
      if (value === "0" || value === 0) return "No";
    }

    if (UNIX_TIMESTAMP_ATTRIBUTES.has(t)) {
      const n = typeof value === "number" ? value : Number(value);
      if (Number.isFinite(n) && n > 0) {
        const d = new Date(n * 1000);
        if (!Number.isNaN(d.getTime())) return d.toLocaleString();
      }
    }

    return String(value);
  };

  // Responsive dimensions - smaller on mobile, larger on desktop
  const cardHeight = "h-[380px] sm:h-[420px] lg:h-[520px]";
  const cardWidth = "w-[280px] sm:w-[320px] lg:w-[380px]";

  const imageClasses = "block h-full w-full object-contain";
  const fallbackBoxClasses =
    "flex h-full w-full items-center justify-center bg-surface/70 px-6 text-zinc-600";

  return (
    <div className="flex flex-col gap-4">
      {/* Main Content: Image + Right Panel */}
      <div className="flex flex-col lg:flex-row gap-4 lg:gap-28 justify-center items-start">
        {/* Left: Beast Card */}
        <div className={`${cardWidth} ${cardHeight} flex-shrink-0`}>
          <CometCard>
            {beast.image ? (
              <img
                src={beast.image}
                alt={beast.name}
                className={imageClasses}
              />
            ) : (
              <div className={fallbackBoxClasses}>No image available</div>
            )}
          </CometCard>
        </div>

        {/* Right: Tabs + Content - Same dimensions as card */}
        <div className={`${cardWidth} flex flex-col gap-2 flex-shrink-0`}>
          {/* Tab Buttons - Compact */}
          <div className="flex rounded-lg border border-white/[0.06] bg-surface/60 p-0.5">
            <button
              type="button"
              onClick={() => setRightPanelTab("metadata")}
              className={cn(
                "flex-1 rounded-md px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider transition-all",
                rightPanelTab === "metadata"
                  ? "bg-gold/15 text-gold border border-gold/20"
                  : "text-zinc-500 hover:text-gold",
              )}
            >
              Metadata
            </button>
            <button
              type="button"
              onClick={() => setRightPanelTab("summit")}
              className={cn(
                "flex-1 rounded-md px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider transition-all",
                rightPanelTab === "summit"
                  ? "bg-accent/20 text-accent border border-accent/30"
                  : "text-zinc-500 hover:text-accent",
              )}
            >
              Summit
            </button>
          </div>

          {/* Panel Content - Height to match card minus tabs */}
          <div className="h-[370px] sm:h-[410px] lg:h-[510px] rounded-xl border border-white/[0.06] bg-surface/60 overflow-y-auto">
            {rightPanelTab === "summit" ? (
              /* Summit Stats Panel */
              <div className="min-h-full">
                <SummitStats
                  beast={beast}
                  summitData={summitData ?? null}
                  loading={summitLoading}
                />
              </div>
            ) : (
              /* Metadata Panel */
              <div className="h-full flex flex-col">
                {/* Compact Header */}
                <div className="flex-shrink-0 px-3 py-2 border-b border-white/[0.06] bg-surface/30">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold text-gold uppercase tracking-wider">
                      Attributes
                    </span>
                    <span className="text-[9px] text-zinc-500">
                      {attributes.length}
                    </span>
                  </div>
                </div>

                {/* Scrollable Attributes - Compact Grid */}
                <div className="flex-1 overflow-y-auto p-2">
                  {attributes.length > 0 ? (
                    <div className="grid grid-cols-2 gap-1.5">
                      {attributes.map((attr, idx) => {
                        const style = getAttributeStyle(attr.trait_type);
                        return (
                          <div
                            key={`${attr.trait_type}-${attr.value}-${idx}`}
                            className={`rounded border ${style.border} ${style.bg} px-2 py-1.5`}
                          >
                            <p className="text-[8px] uppercase tracking-wide text-zinc-500 font-medium">
                              {attr.trait_type}
                            </p>
                            <p
                              className={`text-[11px] font-bold ${style.text} truncate`}
                            >
                              {formatAttributeValue(
                                attr.trait_type,
                                attr.value,
                              )}
                            </p>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="flex h-full items-center justify-center">
                      <p className="text-[10px] text-zinc-500">No metadata</p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Footer: Owner + Actions - Only shown when not hidden */}
      {!hideFooter && (
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pt-2 border-t border-white/[0.06]">
          {/* Owned by */}
          <div className="rounded-lg border border-white/[0.06] bg-surface/40 px-4 py-2.5 text-sm text-zinc-400">
            {beast.owner ? (
              <span>
                Owned by{" "}
                <Link
                  to={`/collection/${encodeURIComponent(accountIdentifier)}`}
                  className="text-gold font-medium hover:underline"
                >
                  {ownerLabel}
                </Link>
              </span>
            ) : (
              <span>Not owned</span>
            )}
          </div>

          {/* Action Buttons */}
          {actionSlot && <div className="flex flex-wrap gap-2">{actionSlot}</div>}
        </div>
      )}
    </div>
  );
}

export default BeastDetailContent;

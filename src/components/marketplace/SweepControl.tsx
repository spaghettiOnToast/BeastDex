import { useMemo, useState, useCallback, useEffect, useRef } from "react";
import { Button } from "../ui/button";
import type { Listing } from "../../services/marketplace/types";
import { toBigIntSafe } from "../../utils/bigint";
import { CLIENT_FEE_BP } from "../../services/marketplace/constants";
import { Zap, ChevronDown, X } from "lucide-react";
import { useEkuboTokens, tokenAmountToUsd } from "../../hooks/useEkuboTokens";

type Props = {
  listings: Listing[];
  onSweep: (listings: Listing[]) => void;
  isInCart: (listingId: string) => boolean;
  disabled?: boolean;
  maxItems?: number;
  onSelectionChange?: (listingIds: Set<string>) => void;
  excludedIds?: Set<string>; // Listings manually excluded from sweep
  defaultExpanded?: boolean;
};

export default function SweepControl({
  listings,
  onSweep,
  isInCart,
  disabled = false,
  maxItems = 30,
  onSelectionChange,
  excludedIds = new Set(),
  defaultExpanded = false,
}: Props) {
  const [sweepCount, setSweepCount] = useState(0);
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const { tokens } = useEkuboTokens();

  // Track previous excludedIds size to detect when items are manually excluded
  const prevExcludedSizeRef = useRef(excludedIds.size);

  // When user manually excludes an item, decrease the sweep count
  useEffect(() => {
    const prevSize = prevExcludedSizeRef.current;
    const newSize = excludedIds.size;

    if (newSize > prevSize) {
      // Items were excluded, decrease sweep count by the difference
      const diff = newSize - prevSize;
      setSweepCount(prev => Math.max(0, prev - diff));
    }

    prevExcludedSizeRef.current = newSize;
  }, [excludedIds.size]);

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

  // Get USD value for a listing (including fee)
  const getListingUsdValue = useCallback((listing: Listing): number | null => {
    const tokenAddress = (listing.paymentToken ?? "0x0").toLowerCase();
    const tokenData = tokenDataMap.get(tokenAddress);
    if (!tokenData?.usdPrice) return null;
    try {
      const price = toBigIntSafe(listing.price);
      const fee = (price * BigInt(CLIENT_FEE_BP)) / 10000n;
      const total = price + fee;
      return tokenAmountToUsd(total, tokenData.decimals, tokenData.usdPrice);
    } catch {
      return null;
    }
  }, [tokenDataMap]);

  // Sort listings by USD price (lowest first) and filter out items already in cart or excluded
  // Also filter to only active listings not owned by user
  const sweepableListings = useMemo(() => {
    const withUsd = listings
      .filter((listing) =>
        listing.active &&
        listing.status === "active" &&
        !isInCart(listing.listingId) &&
        !excludedIds.has(listing.listingId)
      )
      .map((listing) => ({
        listing,
        usdValue: getListingUsdValue(listing),
      }))
      // Filter out listings without USD price (can't compare them)
      .filter((item) => item.usdValue !== null);

    // Sort by USD value (lowest first)
    withUsd.sort((a, b) => (a.usdValue as number) - (b.usdValue as number));

    return withUsd.map((item) => item.listing);
  }, [listings, isInCart, getListingUsdValue, excludedIds]);

  // Get the listings that would be swept based on current count
  const listingsToSweep = useMemo(() => {
    return sweepableListings.slice(0, sweepCount);
  }, [sweepableListings, sweepCount]);

  // Track previous selection to avoid infinite loops
  const prevSelectionRef = useRef<string>("");

  // Notify parent of selection changes (only when IDs actually change)
  useEffect(() => {
    if (onSelectionChange) {
      const selectedIds = listingsToSweep.map(l => l.listingId);
      const selectionKey = selectedIds.join(",");

      // Only call if selection actually changed
      if (selectionKey !== prevSelectionRef.current) {
        prevSelectionRef.current = selectionKey;
        onSelectionChange(new Set(selectedIds));
      }
    }
  }, [listingsToSweep, onSelectionChange]);

  // Calculate total USD value
  const totalUsd = useMemo(() => {
    let total = 0;
    for (const listing of listingsToSweep) {
      const usdValue = getListingUsdValue(listing);
      if (usdValue !== null) {
        total += usdValue;
      }
    }
    return total;
  }, [listingsToSweep, getListingUsdValue]);

  // Get floor USD price
  const floorUsd = useMemo(() => {
    if (sweepableListings.length === 0) return null;
    return getListingUsdValue(sweepableListings[0]);
  }, [sweepableListings, getListingUsdValue]);

  const maxSweepable = Math.min(sweepableListings.length, maxItems);
  const canSweep = listingsToSweep.length > 0 && !disabled;

  const handleSweep = () => {
    if (canSweep) {
      onSweep(listingsToSweep);
    }
  };

  // Reference for click-outside detection
  const containerRef = useRef<HTMLDivElement>(null);

  // Close on click outside
  useEffect(() => {
    if (!isExpanded) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsExpanded(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isExpanded]);

  if (sweepableListings.length === 0) {
    return null;
  }

  return (
    <div ref={containerRef} className="relative">
      {/* Toggle button - always visible */}
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border transition-all ${
          isExpanded
            ? "border-purple-500/50 bg-gradient-to-r from-purple-900/40 to-blue-900/40"
            : "border-purple-500/30 bg-gradient-to-r from-purple-900/20 to-blue-900/20 hover:from-purple-900/30 hover:to-blue-900/30"
        }`}
        disabled={disabled}
      >
        <Zap className="w-4 h-4 text-purple-400" />
        <span className="text-sm font-medium text-white">Sweep Floor</span>
        {floorUsd !== null && (
          <span className="text-xs text-zinc-400">from ${floorUsd.toFixed(2)}</span>
        )}
        <ChevronDown className={`w-3.5 h-3.5 text-zinc-400 transition-transform ${isExpanded ? "rotate-180" : ""}`} />
      </button>

      {/* Expanded dropdown panel - absolutely positioned */}
      {isExpanded && (
        <div className="absolute right-0 top-full mt-2 z-50 min-w-[400px] rounded-lg border border-purple-500/30 bg-surface-overlay/95 backdrop-blur-sm p-4 shadow-xl shadow-purple-900/20">
          {/* Close button */}
          <button
            type="button"
            onClick={() => setIsExpanded(false)}
            className="absolute top-2 right-2 p-1 rounded hover:bg-white/[0.06] transition-colors"
          >
            <X className="w-4 h-4 text-zinc-400" />
          </button>

          <div className="flex flex-col gap-4">
            {/* Header */}
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-purple-400" />
              <span className="text-sm font-semibold text-white">Sweep Floor</span>
              <span className="text-xs text-zinc-500">Select items to sweep</span>
            </div>

            {/* Slider and Count */}
            <div className="flex items-center gap-3">
              <input
                type="range"
                min={0}
                max={maxSweepable}
                value={Math.min(sweepCount, maxSweepable)}
                onChange={(e) => setSweepCount(Number(e.target.value))}
                className="flex-1 h-2 bg-white/[0.08] rounded-lg appearance-none cursor-pointer accent-purple-500"
                disabled={disabled || maxSweepable === 0}
              />
              <div className="flex items-center gap-1 flex-shrink-0">
                <input
                  type="number"
                  min={0}
                  max={maxSweepable}
                  value={Math.min(sweepCount, maxSweepable)}
                  onChange={(e) => {
                    const val = Number(e.target.value);
                    if (val >= 0 && val <= maxSweepable) {
                      setSweepCount(val);
                    }
                  }}
                  className="w-14 px-2 py-1 text-center text-sm font-medium bg-white/[0.06] border border-white/[0.08] rounded text-white"
                  disabled={disabled}
                />
                <span className="text-xs text-zinc-400">/ {maxSweepable}</span>
              </div>
            </div>

            {/* Total and Sweep Button */}
            <div className="flex items-center justify-between pt-2 border-t border-white/[0.06]">
              <div className="flex flex-col">
                <span className="text-lg font-bold text-gold">
                  ${totalUsd.toFixed(2)}
                </span>
                <span className="text-[10px] text-zinc-500">
                  incl. {CLIENT_FEE_BP / 100}% fee
                </span>
              </div>

              <Button
                onClick={handleSweep}
                disabled={!canSweep}
                size="sm"
                className="bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 text-white font-semibold px-5 py-2"
              >
                <Zap className="w-4 h-4 mr-1.5" />
                Sweep {listingsToSweep.length}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

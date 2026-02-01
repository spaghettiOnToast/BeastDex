import { useMemo, useState, useCallback, useEffect, useRef } from "react";
import { Button } from "../ui/button";
import type { Listing } from "../../services/marketplace/types";
import { toBigIntSafe } from "../../utils/bigint";
import { CLIENT_FEE_BP } from "../../services/marketplace/constants";
import { Zap } from "lucide-react";
import { useEkuboTokens, tokenAmountToUsd } from "../../hooks/useEkuboTokens";

type Props = {
  listings: Listing[];
  onSweep: (listings: Listing[]) => void;
  isInCart: (listingId: string) => boolean;
  disabled?: boolean;
  maxItems?: number;
  onSelectionChange?: (listingIds: Set<string>) => void;
  excludedIds?: Set<string>; // Listings manually excluded from sweep
};

export default function SweepControl({
  listings,
  onSweep,
  isInCart,
  disabled = false,
  maxItems = 30,
  onSelectionChange,
  excludedIds = new Set(),
}: Props) {
  const [sweepCount, setSweepCount] = useState(0);
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

  // Get floor and ceiling USD prices
  const floorUsd = useMemo(() => {
    if (listingsToSweep.length === 0) return null;
    return getListingUsdValue(listingsToSweep[0]);
  }, [listingsToSweep, getListingUsdValue]);

  const ceilingUsd = useMemo(() => {
    if (listingsToSweep.length <= 1) return null;
    return getListingUsdValue(listingsToSweep[listingsToSweep.length - 1]);
  }, [listingsToSweep, getListingUsdValue]);

  const maxSweepable = Math.min(sweepableListings.length, maxItems);
  const canSweep = listingsToSweep.length > 0 && !disabled;

  const handleSweep = () => {
    if (canSweep) {
      onSweep(listingsToSweep);
    }
  };

  if (sweepableListings.length === 0) {
    return null;
  }

  return (
    <div className="rounded-lg border border-gray-800 bg-gradient-to-r from-purple-900/20 to-blue-900/20 p-3 sm:p-4">
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
        {/* Sweep Icon and Label */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <Zap className="w-4 h-4 sm:w-5 sm:h-5 text-purple-400" />
          <span className="text-sm font-semibold text-white">Sweep Floor</span>
        </div>

        {/* Slider and Count */}
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <input
            type="range"
            min={0}
            max={maxSweepable}
            value={Math.min(sweepCount, maxSweepable)}
            onChange={(e) => setSweepCount(Number(e.target.value))}
            className="flex-1 h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-purple-500"
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
              className="w-12 sm:w-14 px-2 py-1 text-center text-sm font-medium bg-gray-800 border border-gray-700 rounded text-white"
              disabled={disabled}
            />
            <span className="text-xs text-gray-400">/ {maxSweepable}</span>
          </div>
        </div>

        {/* Total in USD */}
        <div className="flex flex-col gap-0.5 flex-shrink-0 min-w-[100px]">
          <div className="flex items-center justify-end gap-1.5">
            <span className="text-sm font-bold text-lsGold">
              ${totalUsd.toFixed(2)}
            </span>
          </div>
          <p className="text-[10px] text-gray-500 text-right">
            incl. {CLIENT_FEE_BP / 100}% fee
          </p>
        </div>

        {/* Sweep Button */}
        <Button
          onClick={handleSweep}
          disabled={!canSweep}
          className="bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 text-white font-semibold px-4 sm:px-6 py-2 flex-shrink-0"
        >
          <Zap className="w-4 h-4 mr-1.5" />
          Sweep {listingsToSweep.length}
        </Button>
      </div>

      {/* Floor/Ceiling price indicator in USD */}
      {listingsToSweep.length > 0 && floorUsd !== null && (
        <div className="mt-2 pt-2 border-t border-gray-800/50 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-400">
          <span>
            Floor: ${floorUsd.toFixed(2)}
          </span>
          {ceilingUsd !== null && (
            <span>
              Ceiling: ${ceilingUsd.toFixed(2)}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

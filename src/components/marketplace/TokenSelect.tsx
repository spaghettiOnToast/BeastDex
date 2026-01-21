/**
 * Token selector component using Ekubo tokens
 */
import { useMemo } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import { useEkuboTokens } from "../../hooks/useEkuboTokens";
import type { Token } from "../../services/tokens/ekubo";

interface TokenSelectProps {
  value: string; // Token address
  onValueChange: (address: string) => void;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
  /** Filter tokens to only show specific addresses */
  allowedTokens?: string[];
  /** Show loading state */
  showLoading?: boolean;
}

export default function TokenSelect({
  value,
  onValueChange,
  disabled = false,
  placeholder = "Select token",
  className,
  allowedTokens,
  showLoading = true,
}: TokenSelectProps) {
  const { tokens, isLoading } = useEkuboTokens();

  // Filter and sort tokens
  const displayTokens = useMemo(() => {
    let filtered = tokens;

    // Filter by allowed tokens if specified
    if (allowedTokens && allowedTokens.length > 0) {
      const allowedSet = new Set(allowedTokens.map((a) => a.toLowerCase()));
      filtered = tokens.filter((t) => allowedSet.has(t.address.toLowerCase()));
    }

    // Sort by sort_order (already sorted from API, but ensure)
    return filtered.sort((a, b) => a.sortOrder - b.sortOrder);
  }, [tokens, allowedTokens]);

  // Find currently selected token
  const selectedToken = useMemo(() => {
    if (!value) return null;
    return displayTokens.find(
      (t) => t.address.toLowerCase() === value.toLowerCase()
    );
  }, [displayTokens, value]);

  if (isLoading && showLoading) {
    return (
      <div className={`h-10 rounded-md border border-gray-800 bg-black/50 flex items-center px-3 ${className}`}>
        <span className="text-sm text-gray-500">Loading tokens...</span>
      </div>
    );
  }

  return (
    <Select value={value} onValueChange={onValueChange} disabled={disabled}>
      <SelectTrigger className={`bg-black/50 ${className}`}>
        <SelectValue placeholder={placeholder}>
          {selectedToken ? (
            <TokenDisplay token={selectedToken} />
          ) : (
            placeholder
          )}
        </SelectValue>
      </SelectTrigger>
      <SelectContent className="bg-[#0b0b0f] border-gray-800 max-h-[300px]">
        {displayTokens.map((token) => (
          <SelectItem
            key={token.address}
            value={token.address}
            className="focus:bg-gray-800/50"
          >
            <TokenDisplay token={token} showPrice />
          </SelectItem>
        ))}
        {displayTokens.length === 0 && (
          <div className="px-3 py-2 text-sm text-gray-500">
            No tokens available
          </div>
        )}
      </SelectContent>
    </Select>
  );
}

/**
 * Token display with logo, symbol, and optional price
 */
function TokenDisplay({
  token,
  showPrice = false,
}: {
  token: Token;
  showPrice?: boolean;
}) {
  return (
    <div className="flex items-center gap-2">
      {token.logoUrl ? (
        <img
          src={token.logoUrl}
          alt={token.symbol}
          className="w-5 h-5 rounded-full"
          onError={(e) => {
            // Hide broken images
            (e.target as HTMLImageElement).style.display = "none";
          }}
        />
      ) : (
        <div className="w-5 h-5 rounded-full bg-gray-700 flex items-center justify-center text-[10px] font-bold">
          {token.symbol.slice(0, 2)}
        </div>
      )}
      <span className="font-medium">{token.symbol}</span>
      {showPrice && token.usdPrice != null && (
        <span className="text-xs text-gray-500 ml-auto">
          ${token.usdPrice.toFixed(2)}
        </span>
      )}
    </div>
  );
}

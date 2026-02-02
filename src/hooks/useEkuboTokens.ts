/**
 * React hooks for Ekubo token data
 */
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useCallback, useEffect } from "react";
import {
  fetchEkuboTokens,
  getTokenByAddress,
  type Token,
} from "../services/tokens/ekubo";

// localStorage cache configuration
const TOKENS_CACHE_KEY = "ekubo-tokens-cache";
const CACHE_DURATION_MS = 15 * 60 * 1000; // 15 minutes

interface CachedTokens {
  tokens: Token[];
  timestamp: number;
}

/**
 * Get cached tokens from localStorage
 */
function getCachedTokens(): Token[] | null {
  try {
    const cached = localStorage.getItem(TOKENS_CACHE_KEY);
    if (!cached) return null;

    const { tokens, timestamp }: CachedTokens = JSON.parse(cached);
    const age = Date.now() - timestamp;

    // Return cached tokens if less than 15 minutes old
    if (age < CACHE_DURATION_MS) {
      return tokens;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Save tokens to localStorage cache
 */
function setCachedTokens(tokens: Token[]): void {
  try {
    const cached: CachedTokens = {
      tokens,
      timestamp: Date.now(),
    };
    localStorage.setItem(TOKENS_CACHE_KEY, JSON.stringify(cached));
  } catch {
    // Ignore localStorage errors (quota exceeded, etc.)
  }
}

/**
 * Hook to fetch all available Starknet tokens from Ekubo
 * Uses localStorage for persistence across page refreshes
 */
export function useEkuboTokens() {
  // Get cached tokens for instant display
  const cachedTokens = useMemo(() => getCachedTokens(), []);

  const query = useQuery({
    queryKey: ["ekuboTokens"],
    queryFn: fetchEkuboTokens,
    staleTime: CACHE_DURATION_MS, // 15 minutes
    gcTime: CACHE_DURATION_MS * 2, // Keep in memory for 30 minutes
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    // Use cached tokens as placeholder for instant UI
    placeholderData: cachedTokens ?? undefined,
  });

  // Persist to localStorage when fresh data arrives
  useEffect(() => {
    if (query.data && query.data.length > 0) {
      setCachedTokens(query.data);
    }
  }, [query.data]);

  return {
    tokens: query.data ?? cachedTokens ?? [],
    isLoading: query.isLoading && !cachedTokens,
    error: query.error,
    refetch: query.refetch,
  };
}

/**
 * Hook to get a map of token address -> token data
 */
export function useTokenMap() {
  const { tokens, isLoading } = useEkuboTokens();

  const tokenMap = useMemo(() => {
    const map = new Map<string, Token>();
    for (const token of tokens) {
      map.set(token.address.toLowerCase(), token);
    }
    return map;
  }, [tokens]);

  const getToken = useCallback(
    (address: string): Token | undefined => {
      return tokenMap.get(address.toLowerCase());
    },
    [tokenMap]
  );

  return {
    tokenMap,
    getToken,
    isLoading,
  };
}

/**
 * Hook to get token metadata for a specific address
 */
export function useToken(address: string | undefined) {
  const query = useQuery({
    queryKey: ["ekuboToken", address?.toLowerCase()],
    queryFn: () => (address ? getTokenByAddress(address) : null),
    enabled: !!address,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  return {
    token: query.data,
    isLoading: query.isLoading,
    error: query.error,
  };
}

/**
 * Hook to get token info for a selected address with convenient defaults
 */
export function useSelectedToken(address: string | undefined) {
  const { tokens, isLoading } = useEkuboTokens();

  const token = useMemo(() => {
    if (!address || !tokens.length) return null;
    return tokens.find(
      (t) => t.address.toLowerCase() === address.toLowerCase()
    );
  }, [tokens, address]);

  return {
    token,
    isLoading,
    decimals: token?.decimals ?? 18,
    symbol: token?.symbol ?? "TOKEN",
    logoUrl: token?.logoUrl,
    usdPrice: token?.usdPrice,
  };
}

/**
 * Hook for token prices with periodic refresh
 */
export function useTokenPrices(addresses: string[]) {
  const queryClient = useQueryClient();
  const { tokens, isLoading: tokensLoading } = useEkuboTokens();

  const prices = useMemo(() => {
    const priceMap = new Map<string, number>();
    const tokenMap = new Map(tokens.map((t) => [t.address.toLowerCase(), t]));

    for (const address of addresses) {
      const token = tokenMap.get(address.toLowerCase());
      if (token?.usdPrice != null) {
        priceMap.set(address.toLowerCase(), token.usdPrice);
      }
    }

    return priceMap;
  }, [tokens, addresses]);

  const getPrice = useCallback(
    (address: string): number | null => {
      return prices.get(address.toLowerCase()) ?? null;
    },
    [prices]
  );

  const refreshPrices = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: ["ekuboTokens"] });
  }, [queryClient]);

  return {
    prices,
    getPrice,
    isLoading: tokensLoading,
    refreshPrices,
  };
}

/**
 * Utility to format a token amount with its decimals
 */
export function formatTokenAmount(
  amount: bigint | string | number,
  decimals: number,
  maxDecimals: number = 4
): string {
  const amountBigInt = typeof amount === "bigint" ? amount : BigInt(amount);
  const divisor = 10n ** BigInt(decimals);
  const integerPart = amountBigInt / divisor;
  const fractionalPart = amountBigInt % divisor;

  // Convert fractional part to string with proper padding
  const fractionalStr = fractionalPart.toString().padStart(decimals, "0");
  const trimmedFractional = fractionalStr.slice(0, maxDecimals).replace(/0+$/, "");

  if (trimmedFractional) {
    return `${integerPart}.${trimmedFractional}`;
  }
  return integerPart.toString();
}

/**
 * Utility to convert token amount to USD value
 */
export function tokenAmountToUsd(
  amount: bigint | string | number,
  decimals: number,
  usdPrice: number
): number {
  let amountBigInt: bigint;

  if (typeof amount === "bigint") {
    amountBigInt = amount;
  } else if (typeof amount === "number") {
    // Handle numbers (including scientific notation) by converting to fixed string
    amountBigInt = BigInt(amount.toLocaleString("fullwide", { useGrouping: false }));
  } else {
    // String - try direct conversion, fall back to parsing as number first
    try {
      amountBigInt = BigInt(amount);
    } catch {
      amountBigInt = BigInt(Number(amount).toLocaleString("fullwide", { useGrouping: false }));
    }
  }

  const divisor = 10n ** BigInt(decimals);
  const integerPart = Number(amountBigInt / divisor);
  const fractionalPart = Number(amountBigInt % divisor) / Number(divisor);
  const humanAmount = integerPart + fractionalPart;
  return humanAmount * usdPrice;
}

/**
 * Price formatting utilities for marketplace
 * Converts from wei/smallest units to human-readable format
 */

// Standard token decimals
export const TOKEN_DECIMALS: Record<string, number> = {
  STRK: 18,
  LORDS: 18,
  ETH: 18,
  USDC: 6,
  SURVIVOR: 18,
};

/**
 * Convert from wei (smallest unit) to human-readable format
 * @param weiAmount - Amount in wei as string or bigint
 * @param decimals - Number of decimals for the token (default: 18)
 * @returns Formatted string with appropriate decimal places
 */
import { toBigIntSafe, type BigNumberish } from "./bigint";

export function fromWei(weiAmount: BigNumberish, decimals: number = 18): string {
  try {
    const amount = toBigIntSafe(weiAmount as any);

    // Handle zero
    if (amount === 0n) {
      return '0';
    }

    // Convert to number for display
    const divisor = 10n ** BigInt(decimals);
    const wholePart = amount / divisor;
    const fractionalPart = amount % divisor;

    // If whole part is 0, show up to 2 decimal places
    if (wholePart === 0n && fractionalPart > 0n) {
      const fractionalStr = fractionalPart.toString().padStart(decimals, '0');
      const trimmed = fractionalStr.replace(/0+$/, '');
      const displayFractional = trimmed.slice(0, 2);
      return `0.${displayFractional}`;
    }

    // For amounts >= 1, show up to 2 decimal places
    const fractionalStr = fractionalPart.toString().padStart(decimals, '0');
    const trimmedFractional = fractionalStr.slice(0, 2).replace(/0+$/, '');

    if (trimmedFractional) {
      return `${wholePart}.${trimmedFractional}`;
    }
    return wholePart.toString();
  } catch (error) {
    console.error('Error converting from wei:', error);
    return '0';
  }
}

/**
 * Convert to wei (smallest unit) from human-readable format
 * @param amount - Amount as string or number
 * @param decimals - Number of decimals for the token (default: 18)
 * @returns Amount in wei as bigint
 */
export function toWei(amount: string | number, decimals: number = 18): bigint {
  try {
    const amountStr = typeof amount === 'number' ? amount.toString() : amount;

    // Handle zero
    if (amountStr === '0' || amountStr === '') {
      return 0n;
    }

    // Split into whole and fractional parts
    const [whole = '0', fractional = '0'] = amountStr.split('.');

    // Pad fractional part to decimals length
    const paddedFractional = fractional.padEnd(decimals, '0').slice(0, decimals);

    // Combine and convert to bigint
    const weiStr = whole + paddedFractional;
    return BigInt(weiStr);
  } catch (error) {
    console.error('Error converting to wei:', error);
    return 0n;
  }
}

/**
 * Format price for display with token symbol
 * @param weiAmount - Amount in wei
 * @param tokenSymbol - Token symbol (e.g., 'STRK', 'LORDS', 'ETH')
 * @returns Formatted price string like "1.5 STRK"
 */
export function formatPrice(weiAmount: BigNumberish, tokenSymbol: string = 'STRK'): string {
  const decimals = TOKEN_DECIMALS[tokenSymbol.toUpperCase()] ?? 18;
  const humanReadable = fromWei(weiAmount, decimals);

  return tokenSymbol ? `${humanReadable} ${tokenSymbol}` : humanReadable;
}

export type RatesInSTRK = {
  // price of 1 unit of token (human units) expressed in STRK (human units)
  STRK: number; // always 1
  LORDS?: number;
  USDC?: number;
  ETH?: number;
};

export function formatPriceInSymbol(
  weiAmount: BigNumberish,
  fromSymbol: string,
  displaySymbol: string,
  rates: RatesInSTRK
): string {
  const from = fromSymbol.toUpperCase();
  const to = displaySymbol.toUpperCase();
  if (from === to) return formatPrice(weiAmount, to);

  const fromDecimals = TOKEN_DECIMALS[from] ?? 18;

  // Convert to human-readable number
  const humanFrom = parseFloat(fromWei(weiAmount, fromDecimals));
  if (!Number.isFinite(humanFrom)) return `0 ${to}`;

  // Convert to STRK using rates
  const rFromInSTRK = (rates as any)[from] ?? (from === 'STRK' ? 1 : undefined);
  const rToInSTRK = (rates as any)[to] ?? (to === 'STRK' ? 1 : undefined);
  if (!rFromInSTRK || !rToInSTRK) {
    // Fallback: if we don't have rate for one side, show original
    return formatPrice(weiAmount, fromSymbol);
  }

  const valueInSTRK = humanFrom * rFromInSTRK;
  const valueInTarget = valueInSTRK / rToInSTRK;

  const precision = to === 'USDC' ? 2 : 4;
  return `${valueInTarget.toFixed(precision)} ${to}`;
}

/**
 * Format price with compact notation for large numbers
 * @param weiAmount - Amount in wei
 * @param tokenSymbol - Token symbol
 * @returns Formatted price like "1.5K STRK" or "2.3M STRK"
 */
export function formatPriceCompact(weiAmount: BigNumberish, tokenSymbol: string = 'STRK'): string {
  const decimals = TOKEN_DECIMALS[tokenSymbol.toUpperCase()] ?? 18;
  const humanReadable = fromWei(weiAmount, decimals);
  const num = Number.parseFloat(humanReadable);

  if (num >= 1_000_000) {
    return `${(num / 1_000_000).toFixed(2)}M ${tokenSymbol}`;
  }
  if (num >= 1_000) {
    return `${(num / 1_000).toFixed(2)}K ${tokenSymbol}`;
  }

  return formatPrice(weiAmount, tokenSymbol);
}

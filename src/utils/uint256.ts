/**
 * Uint256 conversion utilities for Starknet
 *
 * Starknet uses Uint256 represented as two 128-bit values (low, high).
 * These utilities provide consistent conversion across the codebase.
 */

/** Mask for extracting the lower 128 bits of a bigint */
export const UINT128_MASK = (1n << 128n) - 1n;

/** Uint256 represented as low and high bigint parts */
export type Uint256 = {
  low: bigint;
  high: bigint;
};

/** Uint256 represented as hex strings for contract calls */
export type Uint256Hex = [string, string];

/**
 * Converts a bigint to Uint256 (low, high) format
 *
 * @param value - The bigint value to convert
 * @returns Object with low and high bigint parts
 */
export function toUint256(value: bigint): Uint256 {
  return {
    low: value & UINT128_MASK,
    high: value >> 128n,
  };
}

/**
 * Converts a bigint to Uint256 hex strings for contract calldata
 *
 * @param value - The bigint value to convert
 * @returns Tuple of [lowHex, highHex] strings with 0x prefix
 */
export function toUint256Hex(value: bigint): Uint256Hex {
  const { low, high } = toUint256(value);
  return [`0x${low.toString(16)}`, `0x${high.toString(16)}`];
}

/**
 * Converts Uint256 (low, high) back to a single bigint
 *
 * @param uint256 - Object with low and high bigint parts
 * @returns The combined bigint value
 */
export function fromUint256(uint256: Uint256): bigint {
  return uint256.high * (1n << 128n) + uint256.low;
}

/**
 * Converts Uint256 from raw response values (strings or numbers) to bigint
 *
 * @param low - The low part (can be hex string, decimal string, or bigint)
 * @param high - The high part (can be hex string, decimal string, or bigint)
 * @returns The combined bigint value
 */
export function fromUint256Raw(
  low: string | bigint,
  high: string | bigint
): bigint {
  const lowBig = typeof low === "bigint" ? low : BigInt(low);
  const highBig = typeof high === "bigint" ? high : BigInt(high);
  return highBig * (1n << 128n) + lowBig;
}

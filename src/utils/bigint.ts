// Utilities for safely converting various numeric representations to BigInt

export type BigNumberish = string | number | bigint;

function isHexString(value: string): boolean {
  const v = value.trim();
  return /^-?0x[0-9a-fA-F]+$/.test(v);
}

function isPlainIntegerString(value: string): boolean {
  const v = value.trim();
  return /^-?\d+$/.test(v);
}

// Convert a decimal or scientific-notation string to an integer string (no separators)
// Examples:
//  "1e+21" -> "1000000000000000000000"
//  "2.5e18" -> "2500000000000000000"
//  "000123" -> "123"
// Throws if the value represents a non-integer (e.g., "1e-3", "0.1").
export function toIntegerDecimalString(input: string): string {
  const str = input.trim();

  // Fast paths
  if (isPlainIntegerString(str)) {
    // Normalize leading zeros
    const normalized = str.replace(/^(-?)0+(\d)/, "$1$2");
    return normalized === "-0" ? "0" : normalized;
  }
  if (isHexString(str)) {
    // BigInt will handle hex; just return as-is for the caller to BigInt()
    return str;
  }

  // General decimal/scientific parser
  // sign, int, optional frac, optional exponent
  const match = /^([+-]?)(\d+)(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/.exec(str);
  if (!match) {
    throw new SyntaxError(`Invalid numeric format: ${input}`);
  }

  const sign = match[1] ?? "";
  const intPart = match[2] ?? "0";
  const fracPart = match[3] ?? "";
  const expStr = match[4];

  const exp = expStr ? parseInt(expStr, 10) : 0;
  // Shift decimal point by exponent
  // Effective exponent relative to integer = exp - frac.length
  const shift = exp - fracPart.length;

  // Combine digits
  let digits = (intPart + fracPart).replace(/^0+(?=\d)/, "");
  if (digits.length === 0) digits = "0";

  if (shift < 0) {
    // Would introduce decimals; only acceptable if trailing zeros can absorb the shift
    // e.g., digits="123000", shift=-3 -> integer 123
    const neededZeros = -shift;
    if (digits.length < neededZeros) {
      // e.g., 1e-3 => 0.001 (non-integer)
      throw new SyntaxError(`Non-integer value not supported: ${input}`);
    }
    const cut = digits.length - neededZeros;
    const tail = digits.slice(cut);
    if (!/^0+$/.test(tail)) {
      // Would produce fractional remainder
      throw new SyntaxError(`Non-integer value not supported: ${input}`);
    }
    digits = digits.slice(0, cut) || "0";
  } else if (shift > 0) {
    digits = digits + "0".repeat(shift);
  }

  // Normalize zeros again
  digits = digits.replace(/^0+(?=\d)/, "");
  if (digits.length === 0) digits = "0";

  // Handle sign; BigInt("-0") is 0n, but normalize to "0"
  if (digits === "0") return "0";
  return sign === "-" ? `-${digits}` : digits;
}

export function toBigIntSafe(value: BigNumberish): bigint {
  if (typeof value === "bigint") return value;

  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new SyntaxError(`Invalid number: ${value}`);
    }
    // Convert number to string; may be scientific
    const asString = String(value);
    const intStr = toIntegerDecimalString(asString);
    return BigInt(intStr);
  }

  // string
  const trimmed = value.trim();
  if (isHexString(trimmed)) return BigInt(trimmed);
  const intStr = toIntegerDecimalString(trimmed);
  return BigInt(intStr);
}


export function bigintToHex(value: bigint | number | string): string {
  if (typeof value === "string") {
    if (value.startsWith("0x")) return value.toLowerCase();
    return `0x${BigInt(value).toString(16)}`;
  }
  if (typeof value === "number") {
    return `0x${BigInt(Math.floor(value)).toString(16)}`;
  }
  return `0x${value.toString(16)}`;
}

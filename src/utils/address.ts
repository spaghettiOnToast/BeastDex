export function normaliseStarknetAddress(value: string | null | undefined): string | null {
  if (!value || typeof value !== "string") {
    return null;
  }

  const address = value.trim().toLowerCase();
  if (address.length === 0) {
    return null;
  }

  // Only accept valid hex addresses starting with 0x
  if (!address.startsWith("0x")) {
    return null;
  }

  // Validate that everything after 0x is valid hex
  const hexPart = address.slice(2);
  if (!/^[0-9a-f]*$/.test(hexPart)) {
    return null;
  }

  const body = hexPart.replace(/^0+/, "");
  const normalisedBody = body.length > 0 ? body : "0";
  return `0x${normalisedBody}`;
}

export function normaliseStarknetAddresses(values: Array<string | null | undefined>): string[] {
  return Array.from(
    new Set(
      values
        .map((value) => normaliseStarknetAddress(value))
        .filter((value): value is string => Boolean(value)),
    ),
  );
}

export function padStarknetAddress(value: string | null | undefined): string | null {
  if (!value || typeof value !== "string") {
    return null;
  }

  const address = value.trim().toLowerCase();
  if (address.length === 0) {
    return null;
  }

  // Only accept valid hex addresses starting with 0x
  if (!address.startsWith("0x")) {
    return null;
  }

  // Validate that everything after 0x is valid hex
  const hexPart = address.slice(2);
  if (!/^[0-9a-f]*$/.test(hexPart)) {
    return null;
  }

  // Pad to 64 characters (0x + 64 hex digits = 66 total)
  const paddedHex = hexPart.padStart(64, "0");
  return `0x${paddedHex}`;
}

export function padStarknetAddresses(values: Array<string | null | undefined>): string[] {
  return Array.from(
    new Set(
      values
        .map((value) => padStarknetAddress(value))
        .filter((value): value is string => Boolean(value)),
    ),
  );
}

/**
 * Compare two Starknet addresses for equality
 * Handles different formats (with/without leading zeros, different padding)
 */
export function compareStarknetAddresses(
  address1: string | null | undefined,
  address2: string | null | undefined
): boolean {
  const normalised1 = normaliseStarknetAddress(address1);
  const normalised2 = normaliseStarknetAddress(address2);

  if (!normalised1 || !normalised2) {
    return false;
  }

  return normalised1 === normalised2;
}

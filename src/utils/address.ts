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

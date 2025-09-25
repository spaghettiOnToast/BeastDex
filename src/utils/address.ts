export function normaliseStarknetAddress(value: string | null | undefined): string | null {
  if (!value || typeof value !== "string") {
    return null;
  }

  const address = value.trim().toLowerCase();
  if (address.length === 0) {
    return null;
  }

  if (!address.startsWith("0x")) {
    return address;
  }

  const body = address.slice(2).replace(/^0+/, "");
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

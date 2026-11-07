/**
 * Beast token-id helpers.
 *
 * Beasts v3 token ids are 251-bit packed felts, so they must never pass through
 * a JS `number` (`parseInt`, `Number`, arithmetic) — that silently loses
 * precision. The canonical in-app form is a decimal string.
 */
import { normalizeTokenId } from "@provable-games/collectables";

export type TokenIdLike = string | number | bigint;

/**
 * Canonical decimal string for a token id given as decimal, 0x-hex, bigint,
 * a safe integer, or a `collection:0xhex` id. Returns null when unparseable
 * or not positive.
 */
export function toTokenIdString(value: TokenIdLike | null | undefined): string | null {
  if (value == null) return null;
  let input: TokenIdLike = value;
  if (typeof input === "string") {
    const trimmed = input.trim();
    if (trimmed.length === 0) return null;
    input = trimmed.includes(":") ? trimmed.slice(trimmed.lastIndexOf(":") + 1) : trimmed;
  }
  if (typeof input === "number" && !Number.isSafeInteger(input)) return null;
  try {
    const normalized = normalizeTokenId(input);
    return normalized === "0" ? null : normalized;
  } catch {
    return null;
  }
}

/** `0x`-prefixed lowercase hex (unpadded) of a token id, or null. */
export function toTokenIdHex(value: TokenIdLike | null | undefined): string | null {
  const dec = toTokenIdString(value);
  return dec ? `0x${BigInt(dec).toString(16)}` : null;
}

/** `0x` + 64-char zero-padded hex, as Torii stores felts/u256s. */
export function toTokenIdHexPadded(value: TokenIdLike | null | undefined): string | null {
  const dec = toTokenIdString(value);
  return dec ? `0x${BigInt(dec).toString(16).padStart(64, "0")}` : null;
}

/** Numeric comparison of two token ids (for sorting). Unparseable ids sort last. */
export function compareTokenIdStrings(a: TokenIdLike, b: TokenIdLike): number {
  const da = toTokenIdString(a);
  const db = toTokenIdString(b);
  if (da === null || db === null) return da === db ? 0 : da === null ? 1 : -1;
  const ba = BigInt(da);
  const bb = BigInt(db);
  return ba < bb ? -1 : ba > bb ? 1 : 0;
}

/** Short display form for long v3 ids: `12345…6789`. Short ids are returned as-is. */
export function shortTokenId(value: TokenIdLike | null | undefined, head = 6, tail = 4): string {
  const dec = toTokenIdString(value) ?? String(value ?? "");
  return dec.length > head + tail + 1 ? `${dec.slice(0, head)}…${dec.slice(-tail)}` : dec;
}

/**
 * The token id as a JS number only when it is a safe integer (legacy-sized
 * ids). For systems still keyed by legacy numeric beast ids (Summit, skulls).
 * Returns null for v3 251-bit ids.
 */
export function toSafeTokenNumber(value: TokenIdLike | null | undefined): number | null {
  const dec = toTokenIdString(value);
  if (!dec) return null;
  const big = BigInt(dec);
  return big <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(big) : null;
}

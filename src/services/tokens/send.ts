/**
 * Sending ERC-20 tokens from the wallet menu: amount parsing, recipient checks
 * and the transfer call. Mirrors the safeguards on the Loot Survivor profile's
 * Send panel (no Ethereum addresses, no truncated addresses, checksum check).
 */
import { validateChecksumAddress, type Call } from "starknet";
import { normaliseStarknetAddress } from "../../utils/address";

/** STRK kept back by "Max" so the wallet can still pay network fees. */
export const STRK_FEE_RESERVE = 2n * 10n ** 18n;
export const STRK_ADDRESS = "0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d";

/** "12.5" -> raw units; null for anything that isn't a plain positive decimal within `decimals`. */
export function parseTokenAmount(input: string, decimals: number): bigint | null {
  const s = input.trim().replace(/,/g, "");
  if (!/^\d*\.?\d*$/.test(s) || s === "" || s === ".") return null;
  const [whole = "", frac = ""] = s.split(".");
  if (frac.length > decimals) return null;
  const raw = BigInt(whole || "0") * 10n ** BigInt(decimals) + BigInt((frac || "").padEnd(decimals, "0") || "0");
  return raw;
}

/** Raw units -> plain decimal string for the amount input (no separators). */
export function rawToInput(raw: bigint, decimals: number): string {
  const base = 10n ** BigInt(decimals);
  const whole = raw / base;
  const frac = (raw % base).toString().padStart(decimals, "0").replace(/0+$/, "");
  return frac ? `${whole}.${frac}` : whole.toString();
}

/** Largest amount "Max" fills in: the whole balance, minus a fee reserve for STRK. */
export function maxSendable(balance: bigint, tokenAddress: string): bigint {
  if (BigInt(tokenAddress) !== BigInt(STRK_ADDRESS)) return balance;
  return balance > STRK_FEE_RESERVE ? balance - STRK_FEE_RESERVE : 0n;
}

export type RecipientCheck =
  | { kind: "empty" }
  | { kind: "address"; address: string }
  | { kind: "name"; name: string }
  | { kind: "invalid"; message: string };

/**
 * Classify what the user typed as a recipient. Addresses are validated here;
 * names (Controller usernames, `.brother`) still need resolving.
 */
export function checkRecipientInput(input: string): RecipientCheck {
  const s = input.trim();
  if (!s) return { kind: "empty" };
  if (/^0x/i.test(s)) {
    const hex = s.slice(2);
    if (!/^[0-9a-fA-F]+$/.test(hex)) return { kind: "invalid", message: "That isn't a valid address." };
    if (hex.length === 40) {
      return {
        kind: "invalid",
        message: "This is an Ethereum address. Starknet uses a different format, so sending here would lose the tokens.",
      };
    }
    if (hex.length > 64) return { kind: "invalid", message: "That address is too long." };
    if (hex.replace(/^0+/, "").length < 50) {
      return {
        kind: "invalid",
        message: "This address is too short to be a real Starknet account (they're about 63 characters). Check it was copied in full.",
      };
    }
    const mixedCase = /[a-f]/.test(hex) && /[A-F]/.test(hex);
    if (mixedCase && !validateChecksumAddress(s)) {
      return {
        kind: "invalid",
        message: "This address fails its checksum, so a character was probably changed. Copy it again from the destination wallet.",
      };
    }
    const address = normaliseStarknetAddress(s);
    return address ? { kind: "address", address } : { kind: "invalid", message: "That isn't a valid address." };
  }
  if (!/^[a-z0-9][a-z0-9._-]{0,63}$/i.test(s)) return { kind: "invalid", message: "Enter a Starknet address or a username." };
  return { kind: "name", name: s };
}

/** ERC-20 `transfer(recipient, amount: u256)`. */
export function buildTransferCall(tokenAddress: string, recipient: string, amount: bigint): Call {
  const low = amount & ((1n << 128n) - 1n);
  const high = amount >> 128n;
  return {
    contractAddress: tokenAddress,
    entrypoint: "transfer",
    calldata: [recipient, `0x${low.toString(16)}`, `0x${high.toString(16)}`],
  };
}

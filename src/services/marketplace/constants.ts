import { configs } from "@cartridge/marketplace";
import { constants as starknetConstants } from "starknet";

const MAINNET_CONFIG = configs[starknetConstants.StarknetChainId.SN_MAIN];

export const MARKETPLACE_ADDRESS =
  (import.meta.env.VITE_MARKETPLACE_ADDRESS as string) ||
  MAINNET_CONFIG?.manifest?.contracts?.Marketplace?.address ||
  "";

// ERC20 address used for payment (optional; depends on marketplace config)
export type PaymentToken = {
  symbol: string;
  address: string; // ERC20 token address or "0x0" for native if contract supports it
  decimals?: number; // optional, not used when avoiding wei conversion
};

// Common tokens; configure via env. If not set, STRK native placeholder is used
const FALLBACK_STRK_ADDRESS =
  (import.meta.env.VITE_TOKEN_STRK as string) ||
  MAINNET_CONFIG?.feeTokenAddress ||
  "0x0";

export const PAYMENT_TOKENS: PaymentToken[] = [
  {
    symbol: "STRK",
    address: FALLBACK_STRK_ADDRESS,
  },
  ...(import.meta.env.VITE_TOKEN_LORDS
    ? [{ symbol: "LORDS", address: import.meta.env.VITE_TOKEN_LORDS as string }]
    : []),
  ...(import.meta.env.VITE_TOKEN_ETH
    ? [{ symbol: "ETH", address: import.meta.env.VITE_TOKEN_ETH as string }]
    : []),
];

export function getPaymentTokenBySymbol(symbol: string | undefined): PaymentToken | null {
  if (!symbol) return null;
  const sym = symbol.trim().toUpperCase();
  return PAYMENT_TOKENS.find((t) => t.symbol.toUpperCase() === sym) || null;
}

export function getPaymentTokenByAddress(address?: string | null): PaymentToken | null {
  if (!address) return null;
  const normalised = address.trim().toLowerCase();
  return (
    PAYMENT_TOKENS.find((t) => t.address.trim().toLowerCase() === normalised) ||
    null
  );
}

export const DEFAULT_PAYMENT_TOKEN: PaymentToken = PAYMENT_TOKENS[0] || {
  symbol: "STRK",
  address: "0x0",
};

// Listing expiration handling
export const DEFAULT_LISTING_DURATION_SECONDS = 60 * 60 * 24 * 30; // 30 days

export const LISTING_DURATION_OPTIONS = [
  { label: "1 Day", value: 60 * 60 * 24 },
  { label: "3 Days", value: 60 * 60 * 24 * 3 },
  { label: "7 Days", value: 60 * 60 * 24 * 7 },
  { label: "14 Days", value: 60 * 60 * 24 * 14 },
  { label: "30 Days", value: DEFAULT_LISTING_DURATION_SECONDS },
] as const;

export function getDefaultListingExpiration(): bigint {
  const nowSeconds = Math.floor(Date.now() / 1000);
  return BigInt(nowSeconds + DEFAULT_LISTING_DURATION_SECONDS);
}

// Collection address (re-use beasts contract)
export { CONTRACT_ADDRESS as BEASTS_COLLECTION_ADDRESS } from "../beast/constants";

// Cairo entrypoint names (confirm against deployed contract)
export const ENTRYPOINTS = {
  list: "list",
  edit: "edit",
  cancel: "cancel",
  buy: "buy",
} as const;

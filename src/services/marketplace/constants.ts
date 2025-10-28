import { configs } from "@cartridge/marketplace";
import { constants as starknetConstants } from "starknet";

const MAINNET_CONFIG = configs[starknetConstants.StarknetChainId.SN_MAIN];

// Prefer Cartridge manifest address; fall back to env only if manifest missing
export const MARKETPLACE_ADDRESS =
  (import.meta.env.VITE_MARKETPLACE_ADDRESS as string) ||
  MAINNET_CONFIG?.manifest?.contracts?.Marketplace?.address ||
  "";

// ERC20 address used for payment (optional; depends on marketplace config)
export type PaymentToken = {
  symbol: string;
  address: string; // ERC20 token address or "0x0" for native if contract supports it
  decimals?: number; // optional, not used when avoiding wei conversion
  logo?: string; // optional, icon URL for the token
};

// Common tokens; configure via env. If not set, STRK native placeholder is used
// Prefer explicit env STRK override; else Cartridge manifest fee token
const FALLBACK_STRK_ADDRESS =
  (import.meta.env.VITE_TOKEN_STRK as string) ||
  MAINNET_CONFIG?.feeTokenAddress ||
  "0x0";

export const PAYMENT_TOKENS: PaymentToken[] = [
  {
    symbol: "LORDS",
    address:
      (import.meta.env.VITE_TOKEN_LORDS as string) ||
      "0x0124aeb495b947201f5fac96fd1138e326ad86195b98df6dec9009158a533b49",
  },
  {
    symbol: "STRK",
    address: FALLBACK_STRK_ADDRESS,
  },
  {
    symbol: "ETH",
    address:
      (import.meta.env.VITE_TOKEN_ETH as string) ||
      "0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7",
  },
  {
    symbol: "USDC",
    address:
      (import.meta.env.VITE_TOKEN_USDC as string) ||
      "0x053c91253bc9682c04929ca02ed00b3e423f6710d2ee7e0d5ebb06f3ecf368a8",
  },
  {
    symbol: "SURVIVOR",
    address:
      (import.meta.env.VITE_TOKEN_SURVIVOR as string) ||
      "0x0", // Placeholder - configure via VITE_TOKEN_SURVIVOR env var
  },
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
  { label: "5 Minutes (Test)", value: 60 * 5 },
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

// Client fee configuration
// Fee is in basis points where 10000 = 100%, so 250 = 2.5%
export const CLIENT_FEE_BP = 250; // 2.5% fee in basis points
export const CLIENT_FEE_RECEIVER = "0x0495fc00f87ab20ae908dd24c763c9553b67955e6301113809320da20e8ecb5b";

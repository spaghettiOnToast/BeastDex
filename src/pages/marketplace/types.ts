import type { SaleEvent } from "@cartridge/marketplace";
import type { Beast } from "../../services/beast";

/**
 * Marketplace view types
 */
export type MarketplaceView = "explore" | "my";

/**
 * Explore sub-tab types
 */
export type ExploreSubTab = "browse" | "recent-listed" | "recent-sold";

/**
 * My Activity sub-tab types
 */
export type MyActivitySubTab = "listings" | "beasts" | "transactions";

/**
 * Transaction entry for user activity tracking
 */
export type TxEntry = {
  type: "list" | "cancel" | "buy" | "edit" | "offer" | "sell";
  tokenId: string;
  beastName?: string;
  price?: string; // in token base units
  paymentToken?: string; // token address
  expiration?: number; // Unix timestamp in seconds
  txHash?: string;
  timestamp: number;
  note?: string;
};

/**
 * Recent sale with associated beast data
 */
export type RecentSale = {
  sale: SaleEvent;
  beast: Beast | null;
};

/**
 * Currency display options
 */
export type DisplayCurrency = "STRK" | "LORDS" | "USDC" | "ETH" | "SURVIVOR";

/**
 * Storage keys for localStorage
 */
export const STORAGE_KEYS = {
  ACTIVITY: "beastdex:my-activity",
  HIDDEN_LISTINGS: "beastdex:hidden-listings",
} as const;

/**
 * Voyager explorer base URL
 */
export const VOYAGER_BASE = "https://voyager.online";

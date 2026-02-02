/**
 * Marketplace view types
 */
export type MarketplaceView = "explore" | "my-beasts" | "my";

/**
 * Explore sub-tab types
 */
export type ExploreSubTab = "browse" | "recent-listed" | "recent-sold" | "activity";

/**
 * My Activity sub-tab types
 */
export type MyActivitySubTab = "listings" | "offers" | "transactions";

/**
 * Transaction entry for user activity tracking
 */
export type TxEntry = {
  type: "list" | "cancel" | "buy" | "edit" | "offer" | "sell" | "offer-accepted" | "sold";
  tokenId: string;
  beastName?: string;
  price?: string; // in token base units
  paymentToken?: string; // token address
  expiration?: number; // Unix timestamp in seconds
  txHash?: string;
  timestamp: number;
  orderId?: number; // For offers/listings - used as secondary sort when timestamp is 0
  note?: string;
  status?: "active" | "expired" | "cancelled" | "completed" | "sold"; // For offers/listings status
};

/**
 * Currency display options
 */
export type DisplayCurrency = "STRK" | "LORDS" | "USDC" | "ETH" | "SURVIVOR";

/**
 * Storage keys for localStorage
 */
export const STORAGE_KEYS = {
  HIDDEN_LISTINGS: "beastdex:hidden-listings",
} as const;

/**
 * Voyager explorer base URL
 */
export const VOYAGER_BASE = "https://voyager.online";

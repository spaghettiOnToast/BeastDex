import type { Beast } from "../beast";

export type Listing = {
  listingId: string;
  tokenId: string;
  seller: string;
  price: string; // price expressed in the token's base units
  paymentToken?: string | null; // token address if ERC20, else native (0x0)
  active: boolean;
  createdAt?: number;
  quantity?: number;
  expiration?: number;
  beast?: Beast | null;
  orderId?: number;
};

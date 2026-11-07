import type { Beast } from "../beast";

export type ListingStatus = 'active' | 'expired' | 'cancelled' | 'sold';

export type Listing = {
  listingId: string;
  tokenId: string;
  seller: string;
  price: string; // price expressed in the token's base units
  paymentToken?: string | null; // token address if ERC20, else native (0x0)
  active: boolean;
  status: ListingStatus;
  createdAt?: number;
  quantity?: number;
  expiration?: number;
  beast?: Beast | null;
  orderId: number;
  /** NFT collection the order is for (Beasts or a festival collection) */
  collection?: string;
  /** festival collections: token metadata (no Beast record exists for these) */
  festival?: FestivalListingToken | null;
};

/** A festival-collection token shown in the marketplace (Tiddy Mun, Black Shuck). */
export type FestivalListingToken = {
  slug: string;
  collectionName: string;
  tokenId: number;
  name: string;
  image: string;
};

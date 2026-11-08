import { describe, it, expect } from "vitest";
import { festivalItemsMatchFilters, matchesAttributeFilters } from "../src/pages/marketplace/utils";
import { marketplaceTokenKey, BEASTS_COLLECTION_ADDRESS } from "../src/services/marketplace/constants";
import { FESTIVAL_COLLECTIONS } from "../src/services/festivalBeasts";
import type { Listing } from "../src/services/marketplace/types";
import type { Beast } from "../src/services/beast";

const base = {
  listingId: "1",
  tokenId: "3",
  seller: "0x1",
  price: "1",
  active: true,
  status: "active",
} as Listing;

const shuck = FESTIVAL_COLLECTIONS[0];
const festivalListing: Listing = {
  ...base,
  collection: shuck.address,
  beast: null,
  festival: { slug: shuck.slug, collectionName: shuck.name, tokenId: 3, name: "Dire Peak", image: "" },
};
const beast = { attributes: [{ trait_type: "Tier", value: "1" }] } as unknown as Beast;
const beastListing: Listing = { ...base, collection: BEASTS_COLLECTION_ADDRESS, beast };

describe("Festival marketplace trait", () => {
  it("shows both kinds with no filters", () => {
    expect(matchesAttributeFilters(festivalListing, {})).toBe(true);
    expect(matchesAttributeFilters(beastListing, {})).toBe(true);
  });

  it("Festival = Yes keeps only festival tokens; No keeps only Beasts", () => {
    expect(matchesAttributeFilters(festivalListing, { Festival: ["1"] })).toBe(true);
    expect(matchesAttributeFilters(beastListing, { Festival: ["1"] })).toBe(false);
    expect(matchesAttributeFilters(festivalListing, { Festival: ["0"] })).toBe(false);
    expect(matchesAttributeFilters(beastListing, { Festival: ["0"] })).toBe(true);
  });

  it("Beast-only traits exclude festival tokens", () => {
    expect(matchesAttributeFilters(festivalListing, { Tier: ["1"] })).toBe(false);
    expect(matchesAttributeFilters(beastListing, { Tier: ["1"] })).toBe(true);
    expect(festivalItemsMatchFilters({ Tier: ["1"] })).toBe(false);
    expect(festivalItemsMatchFilters({ Festival: ["1"] })).toBe(true);
  });

  it("keys tokens by collection so equal ids don't collide", () => {
    expect(marketplaceTokenKey(shuck.address, "3")).not.toBe(marketplaceTokenKey(BEASTS_COLLECTION_ADDRESS, "3"));
    expect(marketplaceTokenKey(undefined, 3)).toBe(marketplaceTokenKey(BEASTS_COLLECTION_ADDRESS, "3"));
  });
});

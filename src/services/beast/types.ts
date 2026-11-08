export type BeastMetadata = {
  name?: string;
  image?: string;
  description?: string;
  external_url?: string;
  animation_url?: string;
  attributes?: BeastAttribute[];
};

export type BeastAttribute = {
  trait_type: string;
  value: string | number;
};

/** Original-art visual preset (Beasts v3 `visualEffects` 0-3). */
export type BeastVisual = "Regular" | "Shiny" | "Animated" | "Shiny Animated";

export type Beast = {
  /** `beasts_nft:0x<hex>` */
  id: string;
  /**
   * Canonical decimal token id. Beasts v3 ids are 251-bit felts — never parse
   * this into a JS number; use BigInt / utils/tokenId helpers.
   */
  tokenId: string;
  name: string;
  image: string;
  owner: string | null;
  attributes: BeastAttribute[];
  metadata: BeastMetadata;
  power: number | null;
  /** species id (v3 registry species, may exceed 75) */
  speciesId?: number;
  shiny?: boolean;
  /** v3: derived from `visualEffects` (presets 2/3), not the always-true SDK flag */
  animated?: boolean;
  visual?: BeastVisual;
  visualEffects?: number;
  cardGrade?: number;
  soulbound?: boolean;
  /** Unix seconds a timed transfer lock ends; 0/undefined when none */
  transferLockedUntil?: number;
  genesis?: boolean;
  /** v3 minter data: legacy token id for migrated beasts, 0 for new v3 mints */
  minterData?: number;
  mega?: boolean;
  midi?: boolean;
  /** false when the package has no bundled sprite (v3 species past the bundled set) */
  hasBundledImage?: boolean;
};

export type AttributeFilterInput = Record<string, Array<string | number>>;
export type BeastAttributeFilters = Record<string, string[]>;

export type BeastSortField = "default" | "beast" | "tier" | "health" | "rank" | "rank-desc" | "last-death";

export type FetchBeastsOptions = {
  limit?: number;
  search?: string;
  attributeFilters?: AttributeFilterInput;
  ownerAddresses?: string[];
  page?: number;
  sort?: BeastSortField;
};

export type BeastStats = {
  mintedCount: number;
  uniqueOwners: number;
  fetchedAt: number;
};

export type BeastHighlightsLeader = {
  owner: string | null;
  username: string | null;
  value: number;
};

export type BeastHighlights = {
  /** counts by v3 visual preset */
  animatedShinyCount: number;
  shinyCount: number;
  animatedCount: number;
  standardCount: number;
  leaders: {
    overall: BeastHighlightsLeader;
    animatedShiny: BeastHighlightsLeader;
    shiny: BeastHighlightsLeader;
    animated: BeastHighlightsLeader;
  };
};

export type BeastSlayerEntry = {
  rank: number;
  /** v3 token id when the beast was found in v3, else the legacy token id */
  beastId: string;
  beastName: string;
  beastRank: number;
  owner: string | null;
  /** all-time adventurer kills: legacy (pre-migration) + v3 */
  kills: number;
  /** false when no v3 token was found for this legacy beast */
  inV3: boolean;
  genesis: boolean;
};

export type BeastPowerRank = {
  rank: number | null;
  totalPower: number;
  totalOwners: number;
};

export type BeastHealthRank = {
  rank: number | null;
  totalHealth: number;
  totalOwners: number;
};



export type FetchLeaderboardOptions = {
  limit?: number;
  offset?: number;
  /** "desc" = most first (default) */
  order?: "asc" | "desc";
  /** Slayer: include the 75 Genesis beasts (default false) */
  includeGenesis?: boolean;
};

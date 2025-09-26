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

export type Beast = {
  id: string;
  numericId: number;
  name: string;
  image: string;
  owner: string | null;
  attributes: BeastAttribute[];
  metadata: BeastMetadata;
  power: number | null;
};

export type AttributeFilterInput = Record<string, Array<string | number>>;
export type BeastAttributeFilters = Record<string, string[]>;

export type FetchBeastsOptions = {
  limit?: number;
  search?: string;
  attributeFilters?: AttributeFilterInput;
  ownerAddresses?: string[];
  page?: number;
  sort?: "default" | "beast" | "tier" | "health" | "rank" | "last-death";
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
  animatedShinyCount: number;
  shinyCount: number;
  animatedCount: number;
  leaders: {
    overall: BeastHighlightsLeader;
    animatedShiny: BeastHighlightsLeader;
    shiny: BeastHighlightsLeader;
    animated: BeastHighlightsLeader;
  };
};

export type BeastPowerRank = {
  rank: number | null;
  totalPower: number;
  totalOwners: number;
};

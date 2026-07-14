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

export type BeastSortField = "default" | "beast" | "tier" | "health" | "rank" | "last-death";

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
  beastId: string;
  beastName: string;
  beastRank: number;
  owner: string | null;
  kills: number;
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

export type LeaderboardEntry = {
  rank: number;
  owner: string;
  username: string | null;
  value: number;
};

export type PowerRankLeaderboard = LeaderboardEntry[];


export type FetchLeaderboardOptions = {
  limit?: number;
  offset?: number;
};

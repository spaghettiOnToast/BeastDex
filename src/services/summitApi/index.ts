import { summitApiFetch } from "./client";
import type {
  SummitApiBeast,
  SummitApiCounts,
  SummitApiTopResponse,
  SummitApiLogsResponse,
  SummitApiDiplomacyBeast,
  SummitApiDiplomacyAllEntry,
  SummitApiLeaderboardEntry,
  SummitApiQuestRewardsTotal,
  SummitApiAllResponse,
} from "./types";

export type {
  SummitApiBeast,
  SummitApiCounts,
  SummitApiTopResponse,
  SummitApiLogsResponse,
  SummitApiLogEntry,
  SummitApiDiplomacyBeast,
  SummitApiDiplomacyAllEntry,
  SummitApiLeaderboardEntry,
  SummitApiQuestRewardsTotal,
  SummitApiTopBeast,
  SummitApiAllBeast,
  SummitApiAllResponse,
} from "./types";

export { mapApiToSummitBeastData, createDefaultSummitBeastData } from "./mappers";

/** Fetch a single beast's Summit stats by token ID. Returns null on 404. */
export async function fetchSummitBeastFromApi(
  tokenId: number,
): Promise<SummitApiBeast | null> {
  try {
    return await summitApiFetch<SummitApiBeast>(`/beasts/token/${tokenId}`);
  } catch (err) {
    if (err instanceof Error && err.message.includes("404")) return null;
    throw err;
  }
}

export async function fetchOwnerBeastsFromApi(
  owner: string,
): Promise<SummitApiBeast[]> {
  return summitApiFetch<SummitApiBeast[]>(`/beasts/${owner}`);
}

export async function fetchBeastCountsFromApi(): Promise<SummitApiCounts> {
  return summitApiFetch<SummitApiCounts>("/beasts/stats/counts");
}

export async function fetchTopSummitBeastsFromApi(
  limit: number = 25,
  offset: number = 0,
): Promise<SummitApiTopResponse> {
  return summitApiFetch<SummitApiTopResponse>(
    `/beasts/stats/top?limit=${limit}&offset=${offset}`,
  );
}

export async function fetchAllBeastsFromApi(options: {
  limit?: number;
  offset?: number;
  prefix?: number;
  suffix?: number;
  beast_id?: number;
  name?: string;
  owner?: string;
  sort?: "summit_held_seconds" | "level";
} = {}): Promise<SummitApiAllResponse> {
  const params = new URLSearchParams();
  if (options.limit != null) params.set("limit", String(options.limit));
  if (options.offset != null) params.set("offset", String(options.offset));
  if (options.prefix != null) params.set("prefix", String(options.prefix));
  if (options.suffix != null) params.set("suffix", String(options.suffix));
  if (options.beast_id != null) params.set("beast_id", String(options.beast_id));
  if (options.name) params.set("name", options.name);
  if (options.owner) params.set("owner", options.owner);
  if (options.sort) params.set("sort", options.sort);

  const query = params.toString();
  return summitApiFetch<SummitApiAllResponse>(
    `/beasts/all${query ? `?${query}` : ""}`,
  );
}

export async function fetchSummitLogsFromApi(options: {
  limit?: number;
  offset?: number;
  category?: string;
  sub_category?: string;
  player?: string;
} = {}): Promise<SummitApiLogsResponse> {
  const params = new URLSearchParams();
  if (options.limit != null) params.set("limit", String(options.limit));
  if (options.offset != null) params.set("offset", String(options.offset));
  if (options.category) params.set("category", options.category);
  if (options.sub_category) params.set("sub_category", options.sub_category);
  if (options.player) params.set("player", options.player);

  const query = params.toString();
  return summitApiFetch<SummitApiLogsResponse>(
    `/logs${query ? `?${query}` : ""}`,
  );
}

export async function fetchDiplomacyBeastsFromApi(
  prefix: number,
  suffix: number,
): Promise<SummitApiDiplomacyBeast[]> {
  return summitApiFetch<SummitApiDiplomacyBeast[]>(
    `/diplomacy?prefix=${prefix}&suffix=${suffix}`,
  );
}

export async function fetchDiplomacyAllFromApi(): Promise<SummitApiDiplomacyAllEntry[]> {
  return summitApiFetch<SummitApiDiplomacyAllEntry[]>("/diplomacy/all");
}

export async function fetchRewardsLeaderboardFromApi(): Promise<SummitApiLeaderboardEntry[]> {
  return summitApiFetch<SummitApiLeaderboardEntry[]>("/leaderboard");
}

export async function fetchQuestRewardsTotalFromApi(): Promise<SummitApiQuestRewardsTotal> {
  return summitApiFetch<SummitApiQuestRewardsTotal>("/quest-rewards/total");
}

export type OwnerSummitRank = {
  rank: number;
  total_owners: number;
  total_rewards: number;
};

/** Derive an owner's rank from the rewards leaderboard. Returns null if not found. */
export async function fetchOwnerSummitRankFromApi(
  owner: string,
): Promise<OwnerSummitRank | null> {
  try {
    const leaderboard = await fetchRewardsLeaderboardFromApi();
    if (leaderboard.length === 0) return null;

    const normalizedOwner = owner.toLowerCase();
    const index = leaderboard.findIndex(
      (entry) => entry.owner.toLowerCase() === normalizedOwner,
    );
    if (index === -1) return null;

    return {
      rank: index + 1,
      total_owners: leaderboard.length,
      total_rewards: leaderboard[index].amount,
    };
  } catch {
    return null;
  }
}

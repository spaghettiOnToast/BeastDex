/**
 * Summit API Response Types
 *
 * These types match the JSON shapes returned by the Summit REST API.
 */

/** Single beast from GET /beasts/token/:token_id or one element of GET /beasts/:owner */
export type SummitApiBeast = {
  id: number;
  token_id: number;
  name: string;
  prefix: string;
  suffix: string;
  tier: number;
  type: string;
  power: number;
  level: number;
  health: number;
  shiny: number;
  animated: number;
  current_level: number;
  current_health: number;
  revival_time: number;
  bonus_health: number;
  bonus_xp: number;
  attack_streak: number;
  last_death_timestamp: number;
  revival_count: number;
  extra_lives: number;
  captured_summit: boolean;
  used_revival_potion: boolean;
  used_attack_potion: boolean;
  max_attack_streak: boolean;
  summit_held_seconds: number;
  spirit: number;
  luck: number;
  specials: boolean;
  wisdom: boolean;
  diplomacy: boolean;
  rewards_earned: number;
  rewards_claimed: number;
  kills_claimed: number;
  quest_rewards_claimed: number;
  adventurers_killed: number;
  last_dm_death_timestamp: number;
  last_killed_by: number;
  entity_hash?: string;
  owner: string | null;
  summit_rank: number | null;
  prefix_id: number;
  suffix_id: number;
};

/** Pagination info from paginated endpoints */
export type SummitApiPagination = {
  limit: number;
  offset: number;
  total: number;
  has_more: boolean;
};

/** GET /beasts/stats/counts */
export type SummitApiCounts = {
  total: number;
  alive: number;
  dead: number;
};

/** One entry from GET /beasts/stats/top */
export type SummitApiTopBeast = {
  token_id: number;
  summit_held_seconds: number;
  bonus_xp: number;
  last_death_timestamp: number;
  owner: string | null;
  beast_name: string;
  prefix: string;
  suffix: string;
  full_name: string;
};

/** GET /beasts/stats/top response */
export type SummitApiTopResponse = {
  data: SummitApiTopBeast[];
  pagination: SummitApiPagination;
};

/** One entry from GET /logs */
export type SummitApiLogEntry = {
  id: string;
  block_number: string;
  event_index: number;
  category: string;
  sub_category: string;
  data: unknown;
  player: string | null;
  token_id: number | null;
  transaction_hash: string;
  created_at: string;
};

/** GET /logs response */
export type SummitApiLogsResponse = {
  data: SummitApiLogEntry[];
  pagination: SummitApiPagination;
};

/** One entry from GET /diplomacy */
export type SummitApiDiplomacyBeast = {
  token_id: number;
  beast_id: number;
  name: string;
  prefix: string;
  suffix: string;
  prefix_id: number;
  suffix_id: number;
  full_name: string;
  level: number;
  current_level: number;
  health: number;
  current_health: number;
  bonus_health: number;
  bonus_xp: number;
  summit_held_seconds: number;
  spirit: number;
  luck: number;
  owner: string | null;
};

/** One entry from GET /leaderboard */
export type SummitApiLeaderboardEntry = {
  owner: string;
  amount: number;
};


/** GET /quest-rewards/total */
export type SummitApiQuestRewardsTotal = {
  total: number;
};

/** GET /beasts/all response (paginated) */
export type SummitApiAllBeast = {
  token_id: number;
  beast_id: number;
  prefix: number;
  suffix: number;
  level: number;
  health: number;
  bonus_health: number;
  bonus_xp: number;
  summit_held_seconds: number;
  spirit: number;
  luck: number;
  specials: boolean;
  wisdom: boolean;
  diplomacy: boolean;
  extra_lives: number;
  owner: string | null;
  shiny: number;
  animated: number;
};

/** GET /beasts/all response */
export type SummitApiAllResponse = {
  data: SummitApiAllBeast[];
  pagination: SummitApiPagination;
};

/** GET /diplomacy/all response entry */
export type SummitApiDiplomacyAllEntry = {
  token_id: number;
  beast_id: number;
  prefix: number;
  suffix: number;
  level: number;
  bonus_xp: number;
};

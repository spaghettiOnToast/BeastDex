import { TORII_PRODUCTION_BASE } from "../shared/toriiEndpoint";
import { LOOT_SURVIVOR_URL } from "../lootSurvivor";

/** Beasts v3 NFT contract (MOBs). */
export const BEASTS_V3_ADDRESS =
  "0x00f739e402e52830a736335a0f47d58ec78ba067443c9c6930da182eab2ff8b0";

export const CONTRACT_ADDRESS =
  (import.meta.env.VITE_BEASTS_ADDRESS as string | undefined)?.trim() ||
  BEASTS_V3_ADDRESS;

const DEFAULT_TORII_SQL_ENDPOINT = import.meta.env.DEV
  ? "/torii/sql"
  : `${TORII_PRODUCTION_BASE}/sql`;

export const TORII_SQL_ENDPOINT =
  (import.meta.env.VITE_TORII_SQL_ENDPOINT as string | undefined)?.trim() ||
  DEFAULT_TORII_SQL_ENDPOINT;

export const TORII_GRAPHQL_ENDPOINT = import.meta.env.DEV
  ? "/torii/graphql"
  : `${TORII_PRODUCTION_BASE}/graphql`;

/**
 * Every Beasts species is capped at 1,243 tokens (1,242 named + 1 genesis).
 * v3 species are open-ended (registry), so collection/tier totals are derived
 * at runtime from the species catalog — see species.ts `fetchBeastSupply`.
 */
export const MAX_BEASTS_PER_TYPE = 1243;

/** Card Grade range (v3). */
export const CARD_GRADE_MIN = 1;
export const CARD_GRADE_MAX = 10;

export const ZERO_BALANCE =
  "0x0000000000000000000000000000000000000000000000000000000000000000";

export const BEAST_STATS_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

export const EXCLUDED_OWNER_ADDRESS =
  "0x07bdeac5b256fa53c11b0bc0368af72916203987429032f37254465ee4ec078b";

/** A beast's page on lootsurvivor.io (where owners manage its music). */
export function lootSurvivorBeastUrl(tokenId: string): string {
  return `${LOOT_SURVIVOR_URL}/beast/${encodeURIComponent(tokenId)}`;
}

export const CONTRACT_ADDRESS =
  "0x046da8955829adf2bda310099a0063451923f02e648cf25a1203aac6335cf0e4";

const DEFAULT_TORII_SQL_ENDPOINT = import.meta.env.DEV
  ? "/torii/sql"
  : "https://api.cartridge.gg/x/pg-beasts/torii/sql";

export const TORII_SQL_ENDPOINT =
  (import.meta.env.VITE_TORII_SQL_ENDPOINT as string | undefined)?.trim() ||
  DEFAULT_TORII_SQL_ENDPOINT;

export const TORII_GRAPHQL_ENDPOINT = import.meta.env.DEV
  ? "/torii/graphql"
  : "https://api.cartridge.gg/x/pg-beasts/torii/graphql";

export const TOTAL_BEAST_SUPPLY = 93225;

export const ZERO_BALANCE =
  "0x0000000000000000000000000000000000000000000000000000000000000000";

export const BEAST_STATS_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

export const EXCLUDED_OWNER_ADDRESS =
  "0x07bdeac5b256fa53c11b0bc0368af72916203987429032f37254465ee4ec078b";

export const CONTRACT_ADDRESS =
  "0x46da8955829adf2bda310099a0063451923f02e648cf25a1203aac6335cf0e4";

export const TORII_SQL_ENDPOINT = import.meta.env.DEV
  ? "/torii/sql"
  : "https://api.cartridge.gg/x/pg-mainnet-5/torii/sql";

export const TOTAL_BEAST_SUPPLY = 93225;

export const ZERO_BALANCE =
  "0x0000000000000000000000000000000000000000000000000000000000000000";

export const BEAST_STATS_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

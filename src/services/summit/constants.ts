const DEFAULT_SUMMIT_TORII_SQL_ENDPOINT = import.meta.env.DEV
  ? "/summit-torii/sql"
  : "https://api.cartridge.gg/x/pg-mainnet-10/torii/sql";

export const SUMMIT_TORII_SQL_ENDPOINT =
  (import.meta.env.VITE_SUMMIT_TORII_SQL_ENDPOINT as string | undefined)?.trim() ||
  DEFAULT_SUMMIT_TORII_SQL_ENDPOINT;

export const SUMMIT_TABLE_NAME = "summit_relayer_6-LiveBeastStatsEvent";

// Revival cooldown is 24 hours (in seconds)
export const REVIVAL_COOLDOWN_SECONDS = 24 * 60 * 60;

// Revival cooldown display (in hours)
export const REVIVAL_COOLDOWN_HOURS = 24;

// Max bonus levels is 40
export const MAX_BONUS_LEVELS = 40;

// XP required per bonus level (estimated from game mechanics)
export const XP_PER_BONUS_LEVEL = 100;

// Max bonus health is 2000
export const MAX_BONUS_HEALTH = 2000;

// Spirit hour reduction multiplier (each point of spirit reduces revival time by 0.24 hours)
export const SPIRIT_HOUR_REDUCTION_MULTIPLIER = 0.24;

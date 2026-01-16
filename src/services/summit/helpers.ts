import {
  MAX_BONUS_HEALTH,
  MAX_BONUS_LEVELS,
  REVIVAL_COOLDOWN_SECONDS,
  XP_PER_BONUS_LEVEL,
} from "./constants";
import type { RawSummitRow, SummitBeastData, SummitLiveStats } from "./types";

function parseHexTimestamp(hexTimestamp: string): number {
  if (!hexTimestamp) return 0;
  const cleaned = hexTimestamp.startsWith("0x")
    ? hexTimestamp.slice(2)
    : hexTimestamp;
  return parseInt(cleaned, 16);
}

export function mapSummitRow(row: RawSummitRow): SummitLiveStats {
  return {
    tokenId: row.token_id,
    attackStreak: row["live_stats.attack_streak"] ?? 0,
    blocksHeld: row["live_stats.blocks_held"] ?? 0,
    bonusHealth: row["live_stats.bonus_health"] ?? 0,
    bonusXp: row["live_stats.bonus_xp"] ?? 0,
    currentHealth: row["live_stats.current_health"] ?? 0,
    extraLives: row["live_stats.extra_lives"] ?? 0,
    hasClaimedPotions: row["live_stats.has_claimed_potions"] === 1,
    lastDeathTimestamp: parseHexTimestamp(row["live_stats.last_death_timestamp"]),
    revivalCount: row["live_stats.revival_count"] ?? 0,
    stats: {
      diplomacy: row["live_stats.stats.diplomacy"] ?? 0,
      luck: row["live_stats.stats.luck"] ?? 0,
      specials: row["live_stats.stats.specials"] ?? 0,
      spirit: row["live_stats.stats.spirit"] ?? 0,
      wisdom: row["live_stats.stats.wisdom"] ?? 0,
    },
  };
}

export function computeSummitBeastData(
  tokenId: number,
  liveStats: SummitLiveStats | null
): SummitBeastData {
  if (!liveStats) {
    return {
      tokenId,
      liveStats: null,
      revivalTimeRemaining: null,
      canRevive: false,
      bonusLevels: 0,
      maxBonusLevels: MAX_BONUS_LEVELS,
      bonusHealthPercent: 0,
      maxBonusHealth: MAX_BONUS_HEALTH,
    };
  }

  const now = Math.floor(Date.now() / 1000);
  const timeSinceDeath = now - liveStats.lastDeathTimestamp;
  const isAlive = liveStats.currentHealth > 0;

  let revivalTimeRemaining: number | null = null;
  let canRevive = false;

  if (!isAlive && liveStats.lastDeathTimestamp > 0) {
    if (timeSinceDeath >= REVIVAL_COOLDOWN_SECONDS) {
      canRevive = true;
      revivalTimeRemaining = 0;
    } else {
      revivalTimeRemaining = REVIVAL_COOLDOWN_SECONDS - timeSinceDeath;
    }
  }

  const bonusLevels = Math.min(
    Math.floor(liveStats.bonusXp / XP_PER_BONUS_LEVEL),
    MAX_BONUS_LEVELS
  );

  const bonusHealthPercent = Math.min(
    Math.round((liveStats.bonusHealth / MAX_BONUS_HEALTH) * 100),
    100
  );

  return {
    tokenId,
    liveStats,
    revivalTimeRemaining,
    canRevive,
    bonusLevels,
    maxBonusLevels: MAX_BONUS_LEVELS,
    bonusHealthPercent,
    maxBonusHealth: MAX_BONUS_HEALTH,
  };
}

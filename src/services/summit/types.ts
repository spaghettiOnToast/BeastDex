export type SummitLiveStats = {
  tokenId: number;
  attackStreak: number;
  blocksHeld: number;
  bonusHealth: number;
  bonusXp: number;
  currentHealth: number;
  extraLives: number;
  hasClaimedPotions: boolean;
  lastDeathTimestamp: number;
  revivalCount: number;
  stats: {
    diplomacy: number;
    luck: number;
    specials: number;
    spirit: number;
    wisdom: number;
  };
};

export type SummitBeastData = {
  tokenId: number;
  liveStats: SummitLiveStats | null;
  // Computed fields
  revivalTimeRemaining: number | null; // seconds until revival, null if alive or can revive now
  canRevive: boolean;
  bonusLevels: number; // calculated from bonusXp
  maxBonusLevels: number;
  bonusHealthPercent: number; // 0-100
  maxBonusHealth: number;
};

export type RawSummitRow = {
  token_id: number;
  "live_stats.token_id": number;
  "live_stats.attack_streak": number;
  "live_stats.blocks_held": number;
  "live_stats.bonus_health": number;
  "live_stats.bonus_xp": number;
  "live_stats.current_health": number;
  "live_stats.extra_lives": number;
  "live_stats.has_claimed_potions": number;
  "live_stats.last_death_timestamp": string;
  "live_stats.revival_count": number;
  "live_stats.stats.diplomacy": number;
  "live_stats.stats.luck": number;
  "live_stats.stats.specials": number;
  "live_stats.stats.spirit": number;
  "live_stats.stats.wisdom": number;
  internal_executed_at: string;
};

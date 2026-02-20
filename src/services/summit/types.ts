export type SummitLiveStats = {
  tokenId: number;
  attackStreak: number;
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
  // Extended fields from Summit API
  summitRank: number | null;
  summitHeldSeconds: number;
  killsClaimed: number;
  adventurersKilled: number;
  questRewardsClaimed: number;
  rewardsEarned: number;
  rewardsClaimed: number;
  capturedSummit: boolean;
  maxAttackStreak: boolean;
  usedRevivalPotion: boolean;
  usedAttackPotion: boolean;
  diplomacyUnlocked: boolean;
  prefixId: number;
  suffixId: number;
};

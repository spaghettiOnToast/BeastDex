import {
  MAX_BONUS_HEALTH,
  MAX_BONUS_LEVELS,
  XP_PER_BONUS_LEVEL,
} from "../summit/constants";
import type { SummitBeastData, SummitLiveStats } from "../summit/types";
import type { SummitApiBeast } from "./types";

export function mapApiToSummitBeastData(
  apiBeast: SummitApiBeast,
): SummitBeastData {
  const liveStats: SummitLiveStats = {
    tokenId: apiBeast.token_id,
    attackStreak: apiBeast.attack_streak,
    bonusHealth: apiBeast.bonus_health,
    bonusXp: apiBeast.bonus_xp,
    currentHealth: apiBeast.current_health,
    extraLives: apiBeast.extra_lives,
    hasClaimedPotions: apiBeast.used_revival_potion || apiBeast.used_attack_potion,
    lastDeathTimestamp: apiBeast.last_death_timestamp,
    revivalCount: apiBeast.revival_count,
    stats: {
      diplomacy: apiBeast.diplomacy ? 1 : 0,
      luck: apiBeast.luck,
      specials: apiBeast.specials ? 1 : 0,
      spirit: apiBeast.spirit,
      wisdom: apiBeast.wisdom ? 1 : 0,
    },
  };

  const now = Math.floor(Date.now() / 1000);
  const isAlive = apiBeast.current_health > 0;
  const timeSinceDeath = now - apiBeast.last_death_timestamp;

  let revivalTimeRemaining: number | null = null;
  let canRevive = false;

  if (!isAlive && apiBeast.last_death_timestamp > 0) {
    // Use the API-provided revival_time (in ms), convert to seconds for cooldown calc
    const revivalCooldownSeconds = apiBeast.revival_time / 1000;
    if (timeSinceDeath >= revivalCooldownSeconds) {
      canRevive = true;
      revivalTimeRemaining = 0;
    } else {
      revivalTimeRemaining = revivalCooldownSeconds - timeSinceDeath;
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
    tokenId: apiBeast.token_id,
    liveStats,
    revivalTimeRemaining,
    canRevive,
    bonusLevels,
    maxBonusLevels: MAX_BONUS_LEVELS,
    bonusHealthPercent,
    maxBonusHealth: MAX_BONUS_HEALTH,
    summitRank: apiBeast.summit_rank ?? null,
    summitHeldSeconds: apiBeast.summit_held_seconds ?? 0,
    killsClaimed: apiBeast.kills_claimed ?? 0,
    adventurersKilled: apiBeast.adventurers_killed ?? 0,
    questRewardsClaimed: apiBeast.quest_rewards_claimed ?? 0,
    rewardsEarned: apiBeast.rewards_earned ?? 0,
    rewardsClaimed: apiBeast.rewards_claimed ?? 0,
    capturedSummit: apiBeast.captured_summit ?? false,
    maxAttackStreak: apiBeast.max_attack_streak ?? false,
    usedRevivalPotion: apiBeast.used_revival_potion ?? false,
    usedAttackPotion: apiBeast.used_attack_potion ?? false,
    diplomacyUnlocked: apiBeast.diplomacy ?? false,
    prefixId: apiBeast.prefix_id ?? 0,
    suffixId: apiBeast.suffix_id ?? 0,
  };
}

export function createDefaultSummitBeastData(
  tokenId: number
): SummitBeastData {
  return {
    tokenId,
    liveStats: null,
    revivalTimeRemaining: null,
    canRevive: false,
    bonusLevels: 0,
    maxBonusLevels: MAX_BONUS_LEVELS,
    bonusHealthPercent: 0,
    maxBonusHealth: MAX_BONUS_HEALTH,
    summitRank: null,
    summitHeldSeconds: 0,
    killsClaimed: 0,
    adventurersKilled: 0,
    questRewardsClaimed: 0,
    rewardsEarned: 0,
    rewardsClaimed: 0,
    capturedSummit: false,
    maxAttackStreak: false,
    usedRevivalPotion: false,
    usedAttackPotion: false,
    diplomacyUnlocked: false,
    prefixId: 0,
    suffixId: 0,
  };
}

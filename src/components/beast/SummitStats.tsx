import { useEffect, useState } from "react";
import type { SummitBeastData } from "../../services/summit";
import { fetchSkullsClaimed } from "../../services/summit";
import type { Beast } from "../../services/beast";
import {
  REVIVAL_COOLDOWN_HOURS,
  SPIRIT_HOUR_REDUCTION_MULTIPLIER,
} from "../../services/summit/constants";
import {
  fetchDiplomacyBeastsFromApi,
  type SummitApiDiplomacyBeast,
} from "../../services/summitApi";
import { getAttributeValue as getBeastAttribute, getNumericAttribute } from "../../utils/beast";
import { useTokenMap } from "../../hooks/useEkuboTokens";

const SKULL_TOKEN_ADDRESS = "0x01c3c8284d7eed443b42f47e764032a56eaf50a9079d67993b633930e3689814";

/** Reverse lookup: prefix name → numeric ID */
const PREFIX_NAME_TO_ID: Record<string, number> = {
  Agony: 1, Apocalypse: 2, Armageddon: 3, Beast: 4, Behemoth: 5,
  Blight: 6, Blood: 7, Bramble: 8, Brimstone: 9, Brood: 10,
  Carrion: 11, Cataclysm: 12, Chimeric: 13, Corpse: 14, Corruption: 15,
  Damnation: 16, Death: 17, Demon: 18, Dire: 19, Dragon: 20,
  Dread: 21, Doom: 22, Dusk: 23, Eagle: 24, Empyrean: 25,
  Fate: 26, Foe: 27, Gale: 28, Ghoul: 29, Gloom: 30,
  Glyph: 31, Golem: 32, Grim: 33, Hate: 34, Havoc: 35,
  Honour: 36, Horror: 37, Hypnotic: 38, Kraken: 39, Loath: 40,
  Maelstrom: 41, Mind: 42, Miracle: 43, Morbid: 44, Oblivion: 45,
  Onslaught: 46, Pain: 47, Pandemonium: 48, Phoenix: 49, Plague: 50,
  Rage: 51, Rapture: 52, Rune: 53, Skull: 54, Sol: 55,
  Soul: 56, Sorrow: 57, Spirit: 58, Storm: 59, Tempest: 60,
  Torment: 61, Vengeance: 62, Victory: 63, Viper: 64, Vortex: 65,
  Woe: 66, Wrath: 67, Lights: 68, Shimmering: 69,
};

/** Reverse lookup: suffix name → numeric ID */
const SUFFIX_NAME_TO_ID: Record<string, number> = {
  Bane: 1, Root: 2, Bite: 3, Song: 4, Roar: 5,
  Grasp: 6, Instrument: 7, Glow: 8, Bender: 9, Shadow: 10,
  Whisper: 11, Shout: 12, Growl: 13, Tear: 14, Peak: 15,
  Form: 16, Sun: 17, Moon: 18,
};

/**
 * Parse prefix and suffix IDs from a beast name like `"Tempest Roar" Manticore`.
 * Returns [prefixId, suffixId] or [0, 0] if parsing fails.
 */
function parsePrefixSuffixFromName(name: string): [number, number] {
  const match = name.match(/^"(\w+)\s+(\w+)"/);
  if (!match) return [0, 0];
  const prefixId = PREFIX_NAME_TO_ID[match[1]] ?? 0;
  const suffixId = SUFFIX_NAME_TO_ID[match[2]] ?? 0;
  return [prefixId, suffixId];
}

/** Derive beast tier from beast_id (groups of 5 within each 25-beast type group) */
function getBeastTier(beastId: number): number {
  return Math.ceil((((beastId - 1) % 25) + 1) / 5);
}

function computeDiplomacyBonus(allies: SummitApiDiplomacyBeast[]): number {
  if (allies.length < 2) return 0;
  const totalPower = allies.reduce((sum, ally) => {
    const tier = getBeastTier(ally.beast_id);
    return sum + (6 - tier) * ally.current_level;
  }, 0);
  return Math.floor(totalPower / 250);
}

type QuestDef = {
  id: string;
  name: string;
  check: (data: SummitBeastData) => boolean;
};

const QUESTS: QuestDef[] = [
  { id: "attack_summit", name: "First Blood", check: (d) => (d.liveStats?.bonusXp ?? 0) > 0 },
  { id: "max_attack_streak", name: "Consistency is Key", check: (d) => d.maxAttackStreak },
  { id: "level_up_1", name: "Growing Stronger", check: (d) => d.bonusLevels >= 1 },
  { id: "level_up_3", name: "Rising Power", check: (d) => d.bonusLevels >= 3 },
  { id: "level_up_5", name: "Apex Predator", check: (d) => d.bonusLevels >= 5 },
  { id: "level_up_10", name: "Mastery", check: (d) => d.bonusLevels >= 10 },
  { id: "take_summit", name: "Summit Conqueror", check: (d) => d.capturedSummit },
  { id: "hold_summit_10s", name: "Iron Grip", check: (d) => d.summitHeldSeconds >= 10 },
  { id: "revival_potion", name: "Second Wind", check: (d) => d.usedRevivalPotion },
  { id: "attack_potion", name: "A Vital Boost", check: (d) => d.usedAttackPotion },
];

/** Shared quest visual styles */
const LEVEL_UP_VISUAL = {
  icon: <path d="M16 6l2.29 2.29-4.88 4.88-4-4L2 16.59 3.41 18l6-6 4 4 6.3-6.29L22 12V6z" />,
  color: "text-yellow-400", bg: "bg-yellow-900/30", border: "border-yellow-500/50",
};
const POTION_ICON = <path d="M5 19h14v2H5v-2zm7-18c-1.1 0-2 .9-2 2v2H8v2h2v3.26c-1.75.67-3 2.34-3 4.31 0 2.54 2.06 4.61 4.6 4.65h.8c2.54-.04 4.6-2.11 4.6-4.65 0-1.97-1.25-3.64-3-4.31V7h2V5h-2V3c0-1.1-.9-2-2-2z" />;

const QUEST_VISUALS: Record<string, { icon: React.ReactNode; color: string; bg: string; border: string }> = {
  attack_summit: {
    icon: <path d="M14.121 10.48L17.657 7l-1.414-1.414 3.535-3.536 1.414 1.414-3.535 3.536L21.192 10.535l-3.535 3.536-1.414-1.414-3.536 3.535-2.121-2.121 3.536-3.536-2.121-2.12L8.464 11.95 6.343 9.828l3.535-3.535L7.757 4.172 4.222 7.707 2.808 6.293l3.535-3.536L7.757 1.343l8.485 8.485-2.121.652z" />,
    color: "text-gray-200", bg: "bg-gray-500/30", border: "border-gray-400/50",
  },
  max_attack_streak: {
    icon: <path d="M12.395 2.553a1 1 0 00-1.45-.385c-.345.23-.614.558-.822.88-.214.33-.403.713-.57 1.116-.334.804-.614 1.768-.84 2.734a31.365 31.365 0 00-.613 3.58 2.64 2.64 0 01-.945-1.067c-.328-.68-.398-1.534-.398-2.654A1 1 0 005.05 6.05 6.981 6.981 0 003 11a7 7 0 1011.95-4.95c-.592-.591-.98-.985-1.348-1.467-.363-.476-.724-1.063-1.207-2.03zM12.12 15.12A3 3 0 017 13s.879.5 2.5.5c0-1 .5-4 1.25-4.5.5 1 .786 1.293 1.371 1.879A2.99 2.99 0 0113 13a2.99 2.99 0 01-.879 2.121z" />,
    color: "text-orange-400", bg: "bg-orange-900/30", border: "border-orange-500/50",
  },
  level_up_1: LEVEL_UP_VISUAL,
  level_up_3: LEVEL_UP_VISUAL,
  level_up_5: LEVEL_UP_VISUAL,
  level_up_10: LEVEL_UP_VISUAL,
  take_summit: {
    icon: <path d="M14.4 6L14 4H5v17h2v-7h5.6l.4 2h7V6z" />,
    color: "text-amber-400", bg: "bg-amber-900/30", border: "border-amber-500/50",
  },
  hold_summit_10s: {
    icon: <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4z" />,
    color: "text-orange-300", bg: "bg-orange-900/30", border: "border-orange-400/50",
  },
  revival_potion: {
    icon: POTION_ICON,
    color: "text-red-400", bg: "bg-red-900/30", border: "border-red-500/50",
  },
  attack_potion: {
    icon: POTION_ICON,
    color: "text-green-400", bg: "bg-green-900/30", border: "border-green-500/50",
  },
};

function QuestIcons({ summitData }: { summitData: SummitBeastData }) {
  return (
    <div className="flex justify-between w-full">
      {QUESTS.map((q) => {
        const completed = q.check(summitData);
        const v = QUEST_VISUALS[q.id];
        return (
          <div
            key={q.id}
            title={`${q.name}${completed ? " (Completed)" : ""}`}
            className={`h-6 w-6 rounded flex items-center justify-center border ${
              completed
                ? `${v.bg} ${v.border}`
                : "bg-gray-800/50 border-gray-700/50"
            }`}
          >
            <svg
              className={`h-3.5 w-3.5 ${completed ? v.color : "text-gray-600"}`}
              viewBox="0 0 24 24"
              fill="currentColor"
            >
              {v.icon}
            </svg>
          </div>
        );
      })}
    </div>
  );
}

type SummitStatsProps = {
  beast: Beast;
  summitData: SummitBeastData | null;
  loading?: boolean;
};

// Compact ability icons for beast cards
export type AbilityIconsProps = {
  specials: boolean;
  diplomacy: boolean;
  wisdom: boolean;
  luck: number;
  spirit: number;
};

export function CompactAbilityIcons({
  specials,
  diplomacy,
  wisdom,
  luck,
  spirit,
}: AbilityIconsProps) {
  return (
    <div className="flex flex-col gap-1">
      {/* Row 1: Abilities */}
      <div className="flex gap-1">
        {/* Specials */}
        <div
          className={`h-6 w-6 rounded flex items-center justify-center ${specials ? "bg-yellow-900/50" : "bg-gray-800/50"}`}
        >
          <svg
            className={`h-4 w-4 ${specials ? "text-yellow-400" : "text-gray-600"}`}
            viewBox="0 0 24 24"
            fill="currentColor"
          >
            <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
          </svg>
        </div>
        {/* Diplomacy */}
        <div
          className={`h-6 w-6 rounded flex items-center justify-center ${diplomacy ? "bg-purple-900/50" : "bg-gray-800/50"}`}
        >
          <svg
            className={`h-4 w-4 ${diplomacy ? "text-purple-400" : "text-gray-600"}`}
            viewBox="0 0 24 24"
            fill="currentColor"
          >
            <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
          </svg>
        </div>
        {/* Wisdom */}
        <div
          className={`h-6 w-6 rounded flex items-center justify-center ${wisdom ? "bg-blue-900/50" : "bg-gray-800/50"}`}
        >
          <svg
            className={`h-4 w-4 ${wisdom ? "text-blue-400" : "text-gray-600"}`}
            viewBox="0 0 24 24"
            fill="currentColor"
          >
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 17h-2v-2h2v2zm2.07-7.75l-.9.92C13.45 12.9 13 13.5 13 15h-2v-.5c0-1.1.45-2.1 1.17-2.83l1.24-1.26c.37-.36.59-.86.59-1.41 0-1.1-.9-2-2-2s-2 .9-2 2H8c0-2.21 1.79-4 4-4s4 1.79 4 4c0 .88-.36 1.68-.93 2.25z" />
          </svg>
        </div>
      </div>
      {/* Row 2: Attributes with values */}
      <div className="flex gap-1">
        {/* Luck */}
        <div
          className={`h-6 rounded flex items-center gap-0.5 px-1 ${luck > 0 ? "bg-pink-900/50" : "bg-gray-800/50"}`}
        >
          <svg
            className={`h-3.5 w-3.5 ${luck > 0 ? "text-pink-400" : "text-gray-600"}`}
            viewBox="0 0 24 24"
            fill="currentColor"
          >
            <circle cx="7" cy="7" r="2" />
            <circle cx="17" cy="7" r="2" />
            <circle cx="7" cy="17" r="2" />
            <circle cx="17" cy="17" r="2" />
            <circle cx="12" cy="12" r="2" />
          </svg>
          <span
            className={`text-[10px] font-bold ${luck > 0 ? "text-pink-300" : "text-gray-600"}`}
          >
            {luck}
          </span>
        </div>
        {/* Spirit */}
        <div
          className={`h-6 rounded flex items-center gap-0.5 px-1 ${spirit > 0 ? "bg-cyan-900/50" : "bg-gray-800/50"}`}
        >
          <svg
            className={`h-3.5 w-3.5 ${spirit > 0 ? "text-cyan-400" : "text-gray-600"}`}
            viewBox="0 0 20 20"
            fill="currentColor"
          >
            <path d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z" />
          </svg>
          <span
            className={`text-[10px] font-bold ${spirit > 0 ? "text-cyan-300" : "text-gray-600"}`}
          >
            {spirit}
          </span>
        </div>
      </div>
    </div>
  );
}

function AttackStreakSlots({ streak }: { streak: number }) {
  const slots = Array.from({ length: 10 }, (_, i) => i < streak);
  return (
    <div className="flex gap-0.5 w-full">
      {slots.map((filled, idx) => (
        <div
          key={idx}
          className={`flex-1 h-5 rounded flex items-center justify-center ${
            filled
              ? "bg-gradient-to-b from-orange-400 to-orange-600"
              : "bg-gray-800 border border-gray-700"
          }`}
        >
          <svg
            className={`h-3 w-3 ${filled ? "text-yellow-200" : "text-gray-600"}`}
            fill="currentColor"
            viewBox="0 0 20 20"
          >
            <path d="M12.395 2.553a1 1 0 00-1.45-.385c-.345.23-.614.558-.822.88-.214.33-.403.713-.57 1.116-.334.804-.614 1.768-.84 2.734a31.365 31.365 0 00-.613 3.58 2.64 2.64 0 01-.945-1.067c-.328-.68-.398-1.534-.398-2.654A1 1 0 005.05 6.05 6.981 6.981 0 003 11a7 7 0 1011.95-4.95c-.592-.591-.98-.985-1.348-1.467-.363-.476-.724-1.063-1.207-2.03zM12.12 15.12A3 3 0 017 13s.879.5 2.5.5c0-1 .5-4 1.25-4.5.5 1 .786 1.293 1.371 1.879A2.99 2.99 0 0113 13a2.99 2.99 0 01-.879 2.121z" />
          </svg>
        </div>
      ))}
    </div>
  );
}

function StatBox({
  label,
  value,
}: {
  label: string;
  value: string | number | null;
}) {
  return (
    <div className="flex-1 rounded-md border border-gray-700 bg-[#2a2a35] px-1.5 py-1 text-center">
      <p className="text-[7px] uppercase tracking-wider text-gray-400">
        {label}
      </p>
      <p className="text-xs font-bold text-white">{value ?? "—"}</p>
    </div>
  );
}

function ProgressBar({
  label,
  value,
  max,
  color = "purple",
}: {
  label: string;
  value: number;
  max: number;
  color?: "purple" | "green";
}) {
  const percent = Math.min(Math.round((value / max) * 100), 100);
  const isMaxed = percent >= 100;

  const barColor = color === "green" ? "bg-green-500" : "bg-purple-500";
  const bgColor = color === "green" ? "bg-green-900/30" : "bg-purple-900/30";

  return (
    <div className="space-y-0.5">
      <div className="flex items-center justify-between text-[10px]">
        <span className="uppercase tracking-wide text-gray-400 font-semibold">
          {label}
        </span>
        <span className="text-gray-300 font-semibold">
          {isMaxed ? "MAXED" : `${value}/${max}`}
        </span>
      </div>
      <div className={`h-1.5 w-full overflow-hidden rounded-full ${bgColor}`}>
        <div
          className={`h-full transition-all duration-300 ${barColor}`}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}

export function SummitStats({
  beast,
  summitData,
  loading,
}: SummitStatsProps) {
  const tier = getBeastAttribute(beast, "tier") ?? "—";
  const level = getBeastAttribute(beast, "level") ?? "—";
  const beastType = getBeastAttribute(beast, "type") ?? "—";
  const power = beast.power ?? getNumericAttribute(beast, "power");
  const health = getBeastAttribute(beast, "health") ?? "—";

  const liveStats = summitData?.liveStats;
  const { getToken } = useTokenMap();
  const skullToken = getToken(SKULL_TOKEN_ADDRESS);

  // Fetch diplomacy allies when diplomacy is unlocked
  const [allies, setAllies] = useState<SummitApiDiplomacyBeast[]>([]);
  const [alliesLoading, setAlliesLoading] = useState(false);
  const diplomacyBonus = computeDiplomacyBonus(allies);

  // Extract real NFT token ID from beast.id (format: "contract:0x{64-hex}")
  // beast.numericId can be the beast type ID from metadata, not the NFT token ID
  const tokenId = (() => {
    if (!beast.id) return 0;
    const hex = beast.id.includes(":") ? beast.id.slice(beast.id.lastIndexOf(":") + 1) : beast.id;
    if (/^0x[0-9a-f]+$/i.test(hex)) return Number.parseInt(hex, 16);
    return beast.numericId || 0;
  })();

  // Fetch on-chain skulls claimed from Skull contract (null = pending/failed)
  const [skullsClaimed, setSkullsClaimed] = useState<number | null>(null);
  useEffect(() => {
    if (!tokenId) return;
    let cancelled = false;
    fetchSkullsClaimed(tokenId).then((v) => {
      if (!cancelled) setSkullsClaimed(v);
    });
    return () => { cancelled = true; };
  }, [tokenId]);

  // Resolve prefix/suffix IDs: prefer API data, fall back to parsing beast name
  let prefixId = summitData?.prefixId ?? 0;
  let suffixId = summitData?.suffixId ?? 0;
  if ((!prefixId || !suffixId) && beast.name) {
    const [parsedPrefix, parsedSuffix] = parsePrefixSuffixFromName(beast.name);
    if (!prefixId) prefixId = parsedPrefix;
    if (!suffixId) suffixId = parsedSuffix;
  }

  useEffect(() => {
    if (!summitData?.diplomacyUnlocked || !prefixId || !suffixId) {
      setAllies([]);
      return;
    }
    let cancelled = false;
    setAlliesLoading(true);
    fetchDiplomacyBeastsFromApi(prefixId, suffixId)
      .then((result) => {
        if (!cancelled) setAllies(result);
      })
      .catch(() => {
        if (!cancelled) setAllies([]);
      })
      .finally(() => {
        if (!cancelled) setAlliesLoading(false);
      });
    return () => { cancelled = true; };
  }, [summitData?.diplomacyUnlocked, prefixId, suffixId]);

  if (loading) {
    return (
      <div className="h-full p-4 flex items-center justify-center">
        <div className="text-sm text-gray-500">Loading Summit data...</div>
      </div>
    );
  }

  return (
    <div className="min-h-full p-4 flex flex-col gap-2">
      {/* Summit Rank / Tier / Level / Type */}
      <div className="flex gap-1 shrink-0">
        {summitData?.summitRank != null && (
          <div className="flex-1 rounded-md border border-yellow-600/50 bg-yellow-900/20 px-1.5 py-1 text-center">
            <p className="text-[7px] uppercase tracking-wider text-yellow-400">
              Summit Rank
            </p>
            <p className="text-xs font-bold text-yellow-300 flex items-center justify-center gap-0.5">
              <svg className="h-3 w-3 text-yellow-400" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
              </svg>
              #{summitData.summitRank}
            </p>
          </div>
        )}
        <StatBox label="Tier" value={tier} />
        <StatBox label="Level" value={level} />
        <StatBox label="Type" value={beastType} />
      </div>

      {/* Power / Health */}
      <div className="flex gap-1 shrink-0">
        <div className="flex-1 rounded-md border border-gray-700 bg-[#2a2a35] px-1.5 py-1 text-center">
          <p className="text-[7px] uppercase tracking-wider text-gray-400">
            Power
          </p>
          <p className="text-xs font-bold text-white flex items-center justify-center gap-0.5">
            {power ?? "—"}
            <svg
              className="h-3 w-3 text-yellow-400"
              fill="currentColor"
              viewBox="0 0 20 20"
            >
              <path d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z" />
            </svg>
          </p>
        </div>
        <div className="flex-1 rounded-md border border-gray-700 bg-[#2a2a35] px-1.5 py-1 text-center">
          <p className="text-[7px] uppercase tracking-wider text-gray-400">
            Health
          </p>
          <p className="text-xs font-bold text-white flex items-center justify-center gap-0.5">
            <svg
              className="h-3 w-3 text-red-400"
              fill="currentColor"
              viewBox="0 0 20 20"
            >
              <path
                fillRule="evenodd"
                d="M3.172 5.172a4 4 0 015.656 0L10 6.343l1.172-1.171a4 4 0 115.656 5.656L10 17.657l-6.828-6.829a4 4 0 010-5.656z"
                clipRule="evenodd"
              />
            </svg>
            {health ?? "—"}
            {liveStats && liveStats.bonusHealth > 0 && (
              <span className="text-[10px] text-green-400">
                +{liveStats.bonusHealth}
              </span>
            )}
          </p>
        </div>
      </div>

      {/* Summit-specific data */}
      {summitData && liveStats ? (
        <>
          {/* Attack Streak */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <p className="text-[10px] font-bold uppercase tracking-wide text-gray-300">
                Attack Streak
              </p>
              <span className="text-[10px] font-bold text-orange-400">
                PAUSED
              </span>
            </div>
            <AttackStreakSlots streak={liveStats.attackStreak} />
            <p className="text-[10px] font-semibold text-lsGold">
              +{Math.min(liveStats.attackStreak * 10, 100)}% BONUS XP NEXT
              ATTACK
            </p>
          </div>

          {/* Bonus Levels */}
          <ProgressBar
            label="Bonus Levels"
            value={summitData.bonusLevels}
            max={summitData.maxBonusLevels}
            color="purple"
          />

          {/* Bonus Health */}
          <ProgressBar
            label="Bonus Health"
            value={liveStats.bonusHealth}
            max={summitData.maxBonusHealth}
            color="green"
          />

          {/* Attributes - compact inline */}
          <div className="space-y-1">
            <p className="text-[10px] font-bold uppercase tracking-wide text-gray-300">
              Attributes
            </p>
            <div className="flex gap-1">
              {/* Luck */}
              <div className="flex-1 flex items-center gap-1.5 rounded-md border border-gray-700 bg-[#2a2a35] px-1.5 py-1">
                <div
                  className={`h-5 w-5 rounded flex items-center justify-center ${liveStats.stats.luck > 0 ? "bg-pink-600" : "bg-gray-700"}`}
                >
                  <svg
                    className="h-3 w-3 text-white"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                  >
                    <circle cx="7" cy="7" r="2.5" />
                    <circle cx="17" cy="7" r="2.5" />
                    <circle cx="7" cy="17" r="2.5" />
                    <circle cx="17" cy="17" r="2.5" />
                    <circle cx="12" cy="12" r="2.5" />
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[9px] font-bold text-white">LUCK</p>
                  <p className="text-[8px] text-gray-400">
                    {liveStats.stats.luck}/100 • Crit: {liveStats.stats.luck}%
                  </p>
                </div>
              </div>
              {/* Spirit */}
              <div className="flex-1 flex items-center gap-1.5 rounded-md border border-gray-700 bg-[#2a2a35] px-1.5 py-1">
                <div
                  className={`h-5 w-5 rounded flex items-center justify-center ${liveStats.stats.spirit > 0 ? "bg-cyan-500" : "bg-gray-700"}`}
                >
                  <svg
                    className={`h-3 w-3 ${liveStats.stats.spirit > 0 ? "text-white" : "text-gray-500"}`}
                    viewBox="0 0 20 20"
                    fill="currentColor"
                  >
                    <path d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z" />
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[9px] font-bold text-white">SPIRIT</p>
                  <p className="text-[8px] text-gray-400">
                    {liveStats.stats.spirit}/100 • -
                    {Math.floor(
                      liveStats.stats.spirit * SPIRIT_HOUR_REDUCTION_MULTIPLIER,
                    )}
                    h
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Abilities */}
          <div className="space-y-1">
            <p className="text-[10px] font-bold uppercase tracking-wide text-gray-300">
              Abilities
            </p>
            <div className="flex gap-1">
              {([
                { active: !!liveStats.stats.specials, label: "SPECIALS",
                  border: "border-yellow-500/50", bg: "bg-yellow-900/20", iconBg: "bg-yellow-900/50", text: "text-yellow-400",
                  icon: "M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" },
                { active: !!liveStats.stats.diplomacy, label: "DIPLOMACY",
                  border: "border-purple-500/50", bg: "bg-purple-900/20", iconBg: "bg-purple-900/50", text: "text-purple-400",
                  icon: "M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" },
                { active: !!liveStats.stats.wisdom, label: "WISDOM",
                  border: "border-blue-500/50", bg: "bg-blue-900/20", iconBg: "bg-blue-900/50", text: "text-blue-400",
                  icon: "M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 17h-2v-2h2v2zm2.07-7.75l-.9.92C13.45 12.9 13 13.5 13 15h-2v-.5c0-1.1.45-2.1 1.17-2.83l1.24-1.26c.37-.36.59-.86.59-1.41 0-1.1-.9-2-2-2s-2 .9-2 2H8c0-2.21 1.79-4 4-4s4 1.79 4 4c0 .88-.36 1.68-.93 2.25z" },
              ]).map((a) => (
                <div
                  key={a.label}
                  className={`flex-1 flex items-center justify-center gap-1 rounded border py-1 px-1.5 ${
                    a.active ? `${a.border} ${a.bg}` : "border-gray-700 bg-[#2a2a35]"
                  }`}
                >
                  <div className={`h-5 w-5 rounded-full flex items-center justify-center ${a.active ? a.iconBg : "bg-gray-800"}`}>
                    <svg className={`h-3 w-3 ${a.active ? a.text : "text-gray-600"}`} viewBox="0 0 24 24" fill="currentColor">
                      <path d={a.icon} />
                    </svg>
                  </div>
                  <p className={`text-[7px] font-bold ${a.active ? a.text : "text-gray-500"}`}>{a.label}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Diplomacy Alliance */}
          <div className="space-y-1">
            <p className="text-[10px] font-bold uppercase tracking-wide text-gray-300">
              Diplomacy Alliance
            </p>
            <div className="rounded border border-purple-500/30 bg-purple-900/10 px-2 py-1.5">
              {!summitData.diplomacyUnlocked ? (
                <p className="text-[10px] text-gray-400">No allies on this beast</p>
              ) : alliesLoading ? (
                <p className="text-[10px] text-gray-400">Loading allies...</p>
              ) : allies.length >= 2 ? (
                  <div className="flex items-center gap-2">
                    <div className="h-6 w-6 rounded-full bg-purple-900/50 flex items-center justify-center">
                      <svg className="h-3.5 w-3.5 text-purple-400" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
                      </svg>
                    </div>
                    <div className="flex-1">
                      <p className="text-[10px] font-bold text-purple-300">
                        +{allies.length} allies • +{diplomacyBonus} defense bonus • +{diplomacyBonus} str boost
                      </p>
                      <p className="text-[8px] text-purple-400/70">
                        Combined alliance power / 250
                      </p>
                    </div>
                  </div>
              ) : (
                <p className="text-[10px] text-gray-400">
                  No allies found with matching name
                </p>
              )}
            </div>
          </div>

          {/* Quests */}
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <p className="text-[10px] font-bold uppercase tracking-wide text-gray-300">
                Quests
              </p>
              <p className="text-[9px] text-gray-500">
                {QUESTS.filter((q) => q.check(summitData)).length}/{QUESTS.length}
              </p>
            </div>
            <QuestIcons summitData={summitData} />
          </div>

          {/* Revival Time & Potions */}
          <div className="flex items-center justify-between text-[10px]">
            <div className="flex items-center gap-1">
              <span className="uppercase tracking-wide text-gray-400 font-semibold">
                Revival:
              </span>
              <span className="font-bold text-white">
                {REVIVAL_COOLDOWN_HOURS}h
              </span>
            </div>
            <div className="flex items-center gap-0.5 rounded bg-red-900/50 border border-red-700/50 px-1.5 py-0.5">
              <span className="text-xs font-bold text-white">
                {liveStats.revivalCount + 1}
              </span>
              <svg
                className="h-3 w-3 text-red-400"
                fill="currentColor"
                viewBox="0 0 24 24"
              >
                <path d="M5 19h14v2H5v-2zm7-18c-1.1 0-2 .9-2 2v2H8v2h2v3.26c-1.75.67-3 2.34-3 4.31 0 2.54 2.06 4.61 4.6 4.65h.8c2.54-.04 4.6-2.11 4.6-4.65 0-1.97-1.25-3.64-3-4.31V7h2V5h-2V3c0-1.1-.9-2-2-2zm1 14h-2v-2h2v2zm0-4h-2V7h2v4z" />
              </svg>
            </div>
          </div>
        </>
      ) : (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <p className="text-xs text-gray-400 uppercase tracking-wide font-semibold">
              No Summit data available
            </p>
            <p className="mt-1 text-[10px] text-gray-500">
              This beast may not have been used in Summit yet.
            </p>
          </div>
        </div>
      )}

      {/* Skulls — always visible (data comes from NFT metadata + on-chain Skull contract) */}
      {(() => {
        const earned = getNumericAttribute(beast, "Adventurers Killed") ?? 0;
        const claimable = skullsClaimed !== null ? earned - skullsClaimed : null;
        return (
          <div className="space-y-1">
            <div className="flex items-center gap-1">
              {skullToken?.logoUrl && (
                <img src={skullToken.logoUrl} alt="SKULL" className="h-4 w-4 rounded-full" />
              )}
              <p className="text-[10px] font-bold uppercase tracking-wide text-gray-300">
                Skulls
              </p>
            </div>
            <div className="flex gap-1">
              <StatBox label="Earned" value={earned} />
              <StatBox label="Claimed" value={skullsClaimed ?? "..."} />
              <div className="flex-1 rounded-md border border-gray-700 bg-[#2a2a35] px-1.5 py-1 text-center">
                <p className="text-[7px] uppercase tracking-wider text-gray-400">Claimable</p>
                <p className={`text-xs font-bold ${claimable !== null && claimable > 0 ? "text-green-400" : "text-white"}`}>
                  {claimable ?? "..."}
                </p>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

export default SummitStats;

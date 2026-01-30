import type { SummitBeastData } from "../../services/summit";
import type { Beast } from "../../services/beast";
import {
  REVIVAL_COOLDOWN_HOURS,
  SPIRIT_HOUR_REDUCTION_MULTIPLIER,
} from "../../services/summit/constants";

type SummitStatsProps = {
  beast: Beast;
  summitData: SummitBeastData | null;
  loading?: boolean;
  size?: "modal" | "detail";
};

function getAttributeValue(
  beast: Beast,
  traitType: string,
): string | number | null {
  const attr = beast.attributes.find(
    (a) => a.trait_type.toLowerCase() === traitType.toLowerCase(),
  );
  return attr?.value ?? null;
}

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
    <div className="flex gap-1 w-full">
      {slots.map((filled, idx) => (
        <div
          key={idx}
          className={`flex-1 h-7 rounded flex items-center justify-center ${
            filled
              ? "bg-gradient-to-b from-orange-400 to-orange-600"
              : "bg-gray-800 border border-gray-700"
          }`}
        >
          <svg
            className={`h-4 w-4 ${filled ? "text-yellow-200" : "text-gray-600"}`}
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
    <div className="flex-1 rounded-md border border-gray-700 bg-[#2a2a35] px-2 py-2 text-center">
      <p className="text-[8px] uppercase tracking-wider text-gray-400">
        {label}
      </p>
      <p className="text-sm font-bold text-white">{value ?? "—"}</p>
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
  size: _size = "detail",
}: SummitStatsProps) {
  const tier = getAttributeValue(beast, "tier");
  const level = getAttributeValue(beast, "level");
  const beastType = getAttributeValue(beast, "type");
  const power = beast.power ?? getAttributeValue(beast, "power");
  const health = getAttributeValue(beast, "health");

  const liveStats = summitData?.liveStats;

  if (loading) {
    return (
      <div className="h-full p-4 flex items-center justify-center">
        <div className="text-sm text-gray-500">Loading Summit data...</div>
      </div>
    );
  }

  return (
    <div className="h-full p-4 flex flex-col gap-2">
      {/* Tier / Level / Type */}
      <div className="flex gap-1 shrink-0">
        <StatBox label="Tier" value={tier} />
        <StatBox label="Level" value={level} />
        <StatBox label="Type" value={beastType} />
      </div>

      {/* Power / Health */}
      <div className="flex gap-1 shrink-0">
        <div className="flex-1 rounded-md border border-gray-700 bg-[#2a2a35] px-2 py-2 text-center">
          <p className="text-[8px] uppercase tracking-wider text-gray-400">
            Power
          </p>
          <p className="text-sm font-bold text-white flex items-center justify-center gap-1">
            {power ?? "—"}
            <svg
              className="h-3.5 w-3.5 text-yellow-400"
              fill="currentColor"
              viewBox="0 0 20 20"
            >
              <path d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z" />
            </svg>
          </p>
        </div>
        <div className="flex-1 rounded-md border border-gray-700 bg-[#2a2a35] px-2 py-2 text-center">
          <p className="text-[8px] uppercase tracking-wider text-gray-400">
            Health
          </p>
          <p className="text-sm font-bold text-white flex items-center justify-center gap-1">
            <svg
              className="h-3.5 w-3.5 text-red-400"
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
              <span className="text-xs text-green-400">
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
          <div className="space-y-1.5">
            <p className="text-[10px] font-bold uppercase tracking-wide text-gray-300">
              Attributes
            </p>
            <div className="flex gap-1">
              {/* Luck */}
              <div className="flex-1 flex items-center gap-2 rounded-md border border-gray-700 bg-[#2a2a35] px-2 py-2">
                <div
                  className={`h-7 w-7 rounded flex items-center justify-center ${liveStats.stats.luck > 0 ? "bg-pink-600" : "bg-gray-700"}`}
                >
                  <svg
                    className="h-4 w-4 text-white"
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
                  <p className="text-[10px] font-bold text-white">LUCK</p>
                  <p className="text-[9px] text-gray-400">
                    {liveStats.stats.luck}/100 • Crit: {liveStats.stats.luck}%
                  </p>
                </div>
              </div>
              {/* Spirit */}
              <div className="flex-1 flex items-center gap-2 rounded-md border border-gray-700 bg-[#2a2a35] px-2 py-2">
                <div
                  className={`h-7 w-7 rounded flex items-center justify-center ${liveStats.stats.spirit > 0 ? "bg-cyan-500" : "bg-gray-700"}`}
                >
                  <svg
                    className={`h-4 w-4 ${liveStats.stats.spirit > 0 ? "text-white" : "text-gray-500"}`}
                    viewBox="0 0 20 20"
                    fill="currentColor"
                  >
                    <path d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z" />
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] font-bold text-white">SPIRIT</p>
                  <p className="text-[9px] text-gray-400">
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

          {/* Abilities - compact inline row */}
          <div className="space-y-1">
            <p className="text-[10px] font-bold uppercase tracking-wide text-gray-300">
              Abilities
            </p>
            <div className="flex gap-1">
              {/* Specials */}
              <div
                className={`flex-1 flex items-center justify-center gap-1 rounded border py-1 px-1.5 ${
                  liveStats.stats.specials
                    ? "border-yellow-500/50 bg-yellow-900/20"
                    : "border-gray-700 bg-[#2a2a35]"
                }`}
              >
                <div
                  className={`h-5 w-5 rounded-full flex items-center justify-center ${
                    liveStats.stats.specials
                      ? "bg-yellow-900/50"
                      : "bg-gray-800"
                  }`}
                >
                  <svg
                    className={`h-3 w-3 ${liveStats.stats.specials ? "text-yellow-400" : "text-gray-600"}`}
                    viewBox="0 0 24 24"
                    fill="currentColor"
                  >
                    <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                  </svg>
                </div>
                <p
                  className={`text-[7px] font-bold ${liveStats.stats.specials ? "text-yellow-400" : "text-gray-500"}`}
                >
                  SPECIALS
                </p>
              </div>
              {/* Diplomacy */}
              <div
                className={`flex-1 flex items-center justify-center gap-1 rounded border py-1 px-1.5 ${
                  liveStats.stats.diplomacy
                    ? "border-purple-500/50 bg-purple-900/20"
                    : "border-gray-700 bg-[#2a2a35]"
                }`}
              >
                <div
                  className={`h-5 w-5 rounded-full flex items-center justify-center ${
                    liveStats.stats.diplomacy
                      ? "bg-purple-900/50"
                      : "bg-gray-800"
                  }`}
                >
                  <svg
                    className={`h-3 w-3 ${liveStats.stats.diplomacy ? "text-purple-400" : "text-gray-600"}`}
                    viewBox="0 0 24 24"
                    fill="currentColor"
                  >
                    <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
                  </svg>
                </div>
                <p
                  className={`text-[7px] font-bold ${liveStats.stats.diplomacy ? "text-purple-400" : "text-gray-500"}`}
                >
                  DIPLOMACY
                </p>
              </div>
              {/* Wisdom */}
              <div
                className={`flex-1 flex items-center justify-center gap-1 rounded border py-1 px-1.5 ${
                  liveStats.stats.wisdom
                    ? "border-blue-500/50 bg-blue-900/20"
                    : "border-gray-700 bg-[#2a2a35]"
                }`}
              >
                <div
                  className={`h-5 w-5 rounded-full flex items-center justify-center ${
                    liveStats.stats.wisdom ? "bg-blue-900/50" : "bg-gray-800"
                  }`}
                >
                  <svg
                    className={`h-3 w-3 ${liveStats.stats.wisdom ? "text-blue-400" : "text-gray-600"}`}
                    viewBox="0 0 24 24"
                    fill="currentColor"
                  >
                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 17h-2v-2h2v2zm2.07-7.75l-.9.92C13.45 12.9 13 13.5 13 15h-2v-.5c0-1.1.45-2.1 1.17-2.83l1.24-1.26c.37-.36.59-.86.59-1.41 0-1.1-.9-2-2-2s-2 .9-2 2H8c0-2.21 1.79-4 4-4s4 1.79 4 4c0 .88-.36 1.68-.93 2.25z" />
                  </svg>
                </div>
                <p
                  className={`text-[7px] font-bold ${liveStats.stats.wisdom ? "text-blue-400" : "text-gray-500"}`}
                >
                  WISDOM
                </p>
              </div>
            </div>
          </div>

          {/* Revival Time & Potions - compact */}
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

          {/* Blocks - compact */}
          <div className="flex items-center justify-between text-[10px]">
            <span className="uppercase tracking-wide text-gray-400 font-semibold">
              Blocks:
            </span>
            <span className="font-bold text-white text-sm">
              {liveStats.blocksHeld.toLocaleString()}
            </span>
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
    </div>
  );
}

export default SummitStats;

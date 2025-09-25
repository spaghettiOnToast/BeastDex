import type { Beast } from "../../services/beast";
import { TOTAL_BEAST_VARIETIES } from "../../utils/beastCollection";

type ProfileStatsProps = {
  animatedShinyCount: number;
  animatedCount: number;
  shinyCount: number;
  standardCount: number;
  mostPowerful?: Beast | null;
  rarest?: Beast | null;
  highestRanked?: Beast | null;
  lastBeastKilled?: Beast | null;
  lastBeastKilledName?: string | null;
  uniqueBeastTypes: number;
  uniqueAnimatedShinyTypes: number;
  uniqueAnimatedTypes: number;
  uniqueShinyTypes: number;
  uniqueStandardTypes: number;
  showHighlights?: boolean;
};

export function ProfileStats({
  animatedShinyCount,
  animatedCount,
  shinyCount,
  standardCount,
  mostPowerful,
  rarest,
  highestRanked,
  lastBeastKilled,
  lastBeastKilledName,
  uniqueBeastTypes,
  uniqueAnimatedShinyTypes,
  uniqueAnimatedTypes,
  uniqueShinyTypes,
  uniqueStandardTypes,
  showHighlights = true,
}: ProfileStatsProps) {
  return (
    <div
      className={`grid gap-3 ${
        showHighlights ? "sm:grid-cols-2" : "grid-cols-1"
      }`}
    >
      {/* Beast Collection */}
      <div
        className={`rounded-2xl border-2 bg-[#0b0b0f]/60 px-2 ${
          showHighlights ? "py-2" : "py-1"
        }`}
        style={{
          borderImageSource:
            "linear-gradient(to right, rgb(208, 201, 141), #fbbf24, #39ff14)",
          borderImageSlice: 1,
        }}
      >
        <h3 className="text-xs font-semibold uppercase tracking-wide text-lsGold">
          Beast Collection
        </h3>
        <div
          className={`text-xs text-gray-300 ${
            showHighlights ? "mt-2" : "mt-1"
          }`}
        >
          <div className="flex items-start justify-between mb-0.5 last:mb-0">
            <dt className="uppercase tracking-wide text-gray-500">
              Beasts Collected
            </dt>
            <dd className="text-right text-xs">
              <span className="font-semibold text-lsGold">
                {uniqueBeastTypes}
                <span className="text-xs text-gray-500">
                  /{TOTAL_BEAST_VARIETIES} Unique beasts
                </span>
              </span>
            </dd>
          </div>

          <div className="flex items-start justify-between mb-0.5 last:mb-0">
            <dt className="bg-gradient-to-r from-pink-400 via-purple-400 to-blue-400 bg-clip-text text-transparent">
              Animated Shiny
            </dt>
            <dd className="text-right text-xs">
              <span className="bg-gradient-to-r from-pink-400 via-purple-400 to-blue-400 bg-clip-text text-transparent font-semibold">
                {animatedShinyCount.toLocaleString()}
              </span>
              <span className="ml-2 inline-block text-[9px] uppercase tracking-wide text-gray-500">
                {uniqueAnimatedShinyTypes}/{TOTAL_BEAST_VARIETIES} unique beasts
              </span>
            </dd>
          </div>

          <div className="flex items-start justify-between mb-0.5 last:mb-0">
            <dt className="text-sky-300 animate-pulse">Animated</dt>
            <dd className="text-right text-sky-300">
              <span className="font-semibold">
                {animatedCount.toLocaleString()}
              </span>
              <span className="ml-2 inline-block text-[9px] uppercase tracking-wide text-gray-500">
                {uniqueAnimatedTypes}/{TOTAL_BEAST_VARIETIES} unique beasts
              </span>
            </dd>
          </div>

          <div className="flex items-start justify-between mb-0.5 last:mb-0">
            <dt className="text-yellow-300 drop-shadow">Shiny</dt>
            <dd className="text-right text-yellow-200">
              <span className="font-semibold">
                {shinyCount.toLocaleString()}
              </span>
              <span className="ml-2 inline-block text-[9px] uppercase tracking-wide text-gray-500">
                {uniqueShinyTypes}/{TOTAL_BEAST_VARIETIES} unique beasts
              </span>
            </dd>
          </div>

          <div className="flex items-start justify-between mb-0.5 last:mb-0">
            <dt className="text-lsGreen">Standard</dt>
            <dd className="text-right text-lsGreen">
              <span className="font-semibold">
                {standardCount.toLocaleString()}
              </span>
              <span className="ml-2 inline-block text-[9px] uppercase tracking-wide text-gray-500">
                {uniqueStandardTypes}/{TOTAL_BEAST_VARIETIES} unique beasts
              </span>
            </dd>
          </div>
        </div>
      </div>

      {showHighlights && (
        <div
          className="rounded-2xl border-2 bg-[#0b0b0f]/60 px-4 py-3"
          style={{
            borderImageSource:
              "linear-gradient(to right, rgb(208, 201, 141), #fbbf24, #39ff14)",
            borderImageSlice: 1,
          }}
        >
          <h3 className="text-xs font-semibold uppercase tracking-wide text-lsGold">
            Highlights
          </h3>
          <dl className="mt-2 space-y-1 text-xs text-gray-300">
            <div>
              <dt className="uppercase tracking-wide text-gray-500">
                Most Powerful
              </dt>
              <dd className="font-semibold text-gray-200">
                {mostPowerful ? mostPowerful.name : "Unknown"}
              </dd>
            </div>
            <div>
              <dt className="uppercase tracking-wide text-gray-500">
                Rarest Beast
              </dt>
              <dd className="font-semibold text-gray-200">
                {rarest ? rarest.name : "Unknown"}
              </dd>
            </div>
            <div>
              <dt className="uppercase tracking-wide text-gray-500">
                Highest Rank
              </dt>
              <dd className="font-semibold text-lsGold">
                {highestRanked ? highestRanked.name : "Unknown"}
              </dd>
            </div>
            <div>
              <dt className="uppercase tracking-wide text-gray-500">
                Last Beast Killed
              </dt>
              <dd className="font-semibold text-gray-200">
                {lastBeastKilledName ?? lastBeastKilled?.name ?? "Unknown"}
              </dd>
            </div>
          </dl>
        </div>
      )}
    </div>
  );
}

export default ProfileStats;

import { memo } from "react";
import { TOTAL_BEAST_SUPPLY, MAX_BEASTS_PER_TIER, type BeastHighlights, type TierCollectionStats } from "../../services/beast";
import { Alert, AlertDescription } from "../ui/alert";

const TIER_COLORS: Record<number, { text: string; gradient: string; border: string }> = {
  1: {
    text: "text-orange-400",
    gradient: "from-orange-500 to-orange-400",
    border: "border-orange-500/30",
  },
  2: {
    text: "text-purple-400",
    gradient: "from-purple-500 to-purple-400",
    border: "border-purple-500/30",
  },
  3: {
    text: "text-blue-400",
    gradient: "from-blue-500 to-blue-400",
    border: "border-blue-500/30",
  },
  4: {
    text: "text-green-400",
    gradient: "from-green-500 to-green-400",
    border: "border-green-500/30",
  },
  5: {
    text: "text-white",
    gradient: "from-gray-200 to-white",
    border: "border-gray-400/30",
  },
};

type StatsPanelProps = {
  mintedCount: number;
  uniqueOwners: number;
  mintedLoading: boolean;
  mintedError: string | null;
  highlights: BeastHighlights | null;
  highlightsLoading: boolean;
  highlightsError: string | null;
  tierStats: TierCollectionStats[];
  tierStatsLoading: boolean;
  globalError?: string | null;
};

export const StatsPanel = memo(function StatsPanel({
  mintedCount,
  uniqueOwners: _uniqueOwners,
  mintedLoading,
  mintedError,
  highlights,
  highlightsLoading,
  highlightsError,
  tierStats,
  tierStatsLoading,
  globalError,
}: StatsPanelProps) {
  const consolidatedError = globalError || mintedError || highlightsError;
  const remaining = Math.max(TOTAL_BEAST_SUPPLY - mintedCount, 0);
  const progress = TOTAL_BEAST_SUPPLY > 0 ? (mintedCount / TOTAL_BEAST_SUPPLY) * 100 : 0;

  const summaryTiles = [
    {
      label: "Animated Shinies",
      value: highlights?.animatedShinyCount ?? 0,
      gradient: "from-pink-400/20 via-purple-400/10 to-accent/20",
      accent: "text-pink-400",
    },
    {
      label: "Shiny Beasts",
      value: highlights?.shinyCount ?? 0,
      gradient: "from-yellow-400/20 via-amber-400/10 to-orange-400/20",
      accent: "text-amber-400",
    },
    {
      label: "Animated Beasts",
      value: highlights?.animatedCount ?? 0,
      gradient: "from-sky-400/20 via-accent/10 to-teal-400/20",
      accent: "text-accent",
    },
    {
      label: "Standard Beasts",
      value: highlights?.standardCount ?? 0,
      gradient: "from-zinc-500/20 via-zinc-700/10 to-zinc-900/20",
      accent: "text-zinc-300",
    },
  ];

  return (
    <div className="mb-4 sm:mb-6 space-y-3">
      {/* Row 1: Compact collection progress strip */}
      <div className="flex items-center gap-3 sm:gap-5 px-4 py-2.5 rounded-xl border border-white/[0.06] bg-surface-raised">
        {/* Count */}
        <div className="flex items-baseline gap-1.5 shrink-0">
          <span className="text-lg sm:text-xl font-bold text-[#39ff14]">
            {mintedCount.toLocaleString()}
          </span>
          <span className="text-xs sm:text-sm text-zinc-500">/</span>
          <span className="text-xs sm:text-sm text-zinc-400">
            {TOTAL_BEAST_SUPPLY.toLocaleString()}
          </span>
          <span className="text-xs sm:text-sm text-zinc-500 ml-1">Beasts Collected</span>
        </div>

        {/* Progress bar - fills available space */}
        <div className="flex-1 h-2 bg-white/[0.06] rounded-full overflow-hidden">
          <div
            className="h-full bg-[#39ff14] shadow-[0_0_8px_#39ff14] rounded-full transition-all"
            style={{ width: `${progress}%` }}
          />
        </div>

        {/* Remaining */}
        <div className="hidden sm:flex items-center gap-3 shrink-0 text-xs text-zinc-500">
          <span>{mintedLoading ? "..." : `${remaining.toLocaleString()} left`}</span>
        </div>
      </div>

      {/* Row 2: Collection stats summary tiles */}
      <div className="grid gap-3 sm:gap-4 grid-cols-2 xl:grid-cols-4">
        {summaryTiles.map((tile) => (
          <div
            key={tile.label}
            className={`relative overflow-hidden rounded-xl border border-white/[0.06] bg-gradient-to-br ${tile.gradient} p-4 sm:p-5`}
          >
            <div className="absolute inset-0 bg-gradient-to-br from-black/10 via-transparent to-black/40" />
            <div className="relative z-10">
              <div className="text-[10px] sm:text-xs uppercase tracking-[0.3em] text-zinc-400">
                {tile.label}
              </div>
              <div className={`mt-2 sm:mt-3 text-2xl sm:text-3xl font-black tracking-tight ${tile.accent}`}>
                {highlightsLoading && !highlights ? "—" : tile.value.toLocaleString()}
              </div>
              <div className="mt-1 sm:mt-2 text-[10px] sm:text-xs text-zinc-500">
                Total collected across all adventurers
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Row 3: Tier collection stats */}
      <div className="bg-surface-raised border border-white/[0.06] rounded-xl p-3 sm:p-4">
        <div className="text-[10px] sm:text-xs uppercase tracking-[0.35em] text-zinc-500 mb-3 sm:mb-4">
          Collection by Tier
        </div>
        <div className="grid gap-2 sm:gap-3 grid-cols-5">
          {tierStatsLoading ? (
            <div className="col-span-5 flex justify-center py-4">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-accent border-t-transparent" />
            </div>
          ) : (
            tierStats.map((tier) => {
              const tierRemaining = MAX_BEASTS_PER_TIER - tier.collected;
              const tierProgress = (tier.collected / MAX_BEASTS_PER_TIER) * 100;
              const colors = TIER_COLORS[tier.tier] ?? TIER_COLORS[5];
              return (
                <div
                  key={tier.tier}
                  className={`relative overflow-hidden rounded-lg border ${colors.border} bg-white/[0.04] p-2 sm:p-3`}
                >
                  <div className="flex items-center justify-between mb-1.5 sm:mb-2">
                    <span className={`text-xs sm:text-sm font-bold ${colors.text}`}>T{tier.tier}</span>
                    <span className="text-[9px] sm:text-xs text-zinc-400">
                      {tierProgress.toFixed(1)}%
                    </span>
                  </div>
                  <div className="h-1 sm:h-1.5 w-full bg-white/[0.06] rounded-full overflow-hidden mb-1.5 sm:mb-2">
                    <div
                      className={`h-full bg-gradient-to-r ${colors.gradient} transition-all`}
                      style={{ width: `${tierProgress}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-[9px] sm:text-xs">
                    <span className={`font-semibold ${colors.text}`}>
                      {tier.collected.toLocaleString()}
                    </span>
                    <span className={`font-semibold ${tierRemaining <= 100 ? "text-red-400" : "text-zinc-400"}`}>
                      {tierRemaining.toLocaleString()} left
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Error display */}
      {consolidatedError ? (
        <Alert
          variant="destructive"
          className="bg-red-500/10 border-red-500/20"
        >
          <AlertDescription className="text-xs sm:text-sm font-medium text-center">
            {consolidatedError}
          </AlertDescription>
        </Alert>
      ) : null}
    </div>
  );
});

export default StatsPanel;

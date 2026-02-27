import { useEffect, useState } from "react";
import {
  fetchBeastRarityBeastLeaderboard,
  fetchTierCollectionStats,
  MAX_BEASTS_PER_TYPE,
  MAX_BEASTS_PER_TIER,
  type BeastNameLeaderboardEntry,
  type BeastRarityLeaderboardCategory,
  type TierCollectionStats,
} from "../../services/beast";
import { useBeastHighlights } from "../../hooks/useBeastQueries";

const PAGE_SIZE = 10;

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

const CATEGORY_CONFIG: Array<{
  id: BeastRarityLeaderboardCategory;
  label: string;
  highlightClass: string;
}> = [
  {
    id: "all",
    label: "All",
    highlightClass: "from-accent to-accent",
  },
  {
    id: "animatedShiny",
    label: "Animated Shiny",
    highlightClass: "from-pink-400 to-purple-400",
  },
  {
    id: "shiny",
    label: "Shiny",
    highlightClass: "from-yellow-400 to-amber-400",
  },
  {
    id: "animated",
    label: "Animated",
    highlightClass: "from-sky-400 to-accent",
  },
  {
    id: "standard",
    label: "Standard",
    highlightClass: "from-gray-200 to-gray-400",
  },
];

type LoadState = "idle" | "loading" | "error";

export function BeastCollectionStats() {
  const [activeCategory, setActiveCategory] =
    useState<BeastRarityLeaderboardCategory>("all");
  const [leaderboard, setLeaderboard] = useState<BeastNameLeaderboardEntry[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loadState, setLoadState] = useState<LoadState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [reloadNonce, setReloadNonce] = useState(0);
  const [ascending, setAscending] = useState(false);
  const [tierStats, setTierStats] = useState<TierCollectionStats[]>([]);
  const [tierStatsLoading, setTierStatsLoading] = useState(true);

  const { data: highlights, loading: highlightsLoading } = useBeastHighlights();

  useEffect(() => {
    let cancelled = false;
    async function loadTierStats() {
      try {
        setTierStatsLoading(true);
        const data = await fetchTierCollectionStats();
        if (cancelled) return;
        setTierStats(data);
      } catch (err) {
        console.error("Failed to load tier stats:", err);
      } finally {
        if (!cancelled) setTierStatsLoading(false);
      }
    }
    loadTierStats();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    setPage(1);
    setHasMore(true);
    setLeaderboard([]);
    setError(null);
    setLoadState("loading");
    setReloadNonce((prev) => prev + 1);
  }, [activeCategory, ascending]);

  useEffect(() => {
    let cancelled = false;
    async function loadLeaderboard() {
      try {
        setLoadState("loading");
        setError(null);
        const offset = (page - 1) * PAGE_SIZE;
        const data = await fetchBeastRarityBeastLeaderboard({
          category: activeCategory,
          limit: PAGE_SIZE,
          offset,
          ascending,
        });

        if (cancelled) return;

        if (page === 1) {
          setLeaderboard(data);
        } else {
          setLeaderboard((prev) => [...prev, ...data]);
        }

        setHasMore(data.length === PAGE_SIZE);
        setLoadState("idle");
      } catch (err) {
        if (cancelled) return;
        console.error("Failed to load collection stats leaderboard:", err);
        setError("Failed to load leaderboard");
        setLoadState("error");
      }
    }

    loadLeaderboard();

    return () => {
      cancelled = true;
    };
  }, [activeCategory, page, reloadNonce, ascending]);

  const handleLoadMore = () => {
    if (loadState === "loading" || !hasMore) return;
    setPage((prev) => prev + 1);
  };
  const toggleSortOrder = () => {
    setAscending((prev) => !prev);
  };

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

  const activeCategoryMeta = CATEGORY_CONFIG.find(
    (category) => category.id === activeCategory
  );

  const isInitialLoading =
    loadState === "loading" && leaderboard.length === 0 && page === 1;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {summaryTiles.map((tile) => (
          <div
            key={tile.label}
            className={`relative overflow-hidden rounded-xl border border-white/[0.06] bg-gradient-to-br ${tile.gradient} p-5`}
          >
            <div className="absolute inset-0 bg-gradient-to-br from-black/10 via-transparent to-black/40" />
            <div className="relative z-10">
              <div className="text-xs uppercase tracking-[0.3em] text-zinc-400">
                {tile.label}
              </div>
              <div
                className={`mt-3 text-3xl font-black tracking-tight ${tile.accent}`}
              >
                {highlightsLoading && !highlights
                  ? "—"
                  : tile.value.toLocaleString()}
              </div>
              <div className="mt-2 text-xs text-zinc-500">
                Total collected across all adventurers
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Tier Collection Stats */}
      <div className="bg-surface-raised border border-white/[0.06] rounded-xl p-4">
        <div className="text-xs uppercase tracking-[0.35em] text-zinc-500 mb-4">
          Collection by Tier
        </div>
        <div className="grid gap-3 sm:grid-cols-5">
          {tierStatsLoading ? (
            <div className="col-span-5 flex justify-center py-4">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-accent border-t-transparent" />
            </div>
          ) : (
            tierStats.map((tier) => {
              const remaining = MAX_BEASTS_PER_TIER - tier.collected;
              const progress = (tier.collected / MAX_BEASTS_PER_TIER) * 100;
              const colors = TIER_COLORS[tier.tier] ?? TIER_COLORS[5];
              return (
                <div
                  key={tier.tier}
                  className={`relative overflow-hidden rounded-lg border ${colors.border} bg-white/[0.04] p-3`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className={`text-sm font-bold ${colors.text}`}>T{tier.tier}</span>
                    <span className="text-xs text-zinc-400">
                      {progress.toFixed(1)}%
                    </span>
                  </div>
                  <div className="h-1.5 w-full bg-white/[0.06] rounded-full overflow-hidden mb-2">
                    <div
                      className={`h-full bg-gradient-to-r ${colors.gradient} transition-all`}
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className={`font-semibold ${colors.text}`}>
                      {tier.collected.toLocaleString()}
                    </span>
                    <span className={`font-semibold ${remaining <= 100 ? "text-red-400" : "text-zinc-400"}`}>
                      {remaining.toLocaleString()} left
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      <div className="bg-surface-raised border border-white/[0.06] rounded-xl p-4">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="text-xs uppercase tracking-[0.35em] text-zinc-500">
              Leaderboard
            </div>
            <div className="mt-2 flex items-center gap-2 text-lg font-semibold text-white">
              <span
                className={`inline-flex items-center rounded-full border border-white/[0.06] bg-gradient-to-r ${activeCategoryMeta?.highlightClass ?? ""} px-3 py-1 text-xs font-bold uppercase tracking-wide text-surface`}
              >
                {activeCategoryMeta?.label ?? ""}
              </span>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 rounded-xl bg-white/[0.04] p-1.5">
            {CATEGORY_CONFIG.map((category) => (
              <button
                key={category.id}
                onClick={() => setActiveCategory(category.id)}
                className={`min-w-[140px] rounded-lg px-4 py-2 text-sm font-bold uppercase tracking-wider transition-all duration-200 ${
                  activeCategory === category.id
                    ? "bg-accent text-surface"
                    : "text-zinc-300 hover:bg-white/[0.06] hover:text-white"
                }`}
              >
                {category.label}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-4 flex justify-center">
          <button
            onClick={toggleSortOrder}
            className="inline-flex items-center gap-2 rounded-xl border border-white/[0.06] bg-white/[0.04] px-4 py-2 text-sm font-bold uppercase tracking-wider text-zinc-300 transition-all duration-200 hover:bg-white/[0.08] hover:text-white"
          >
            <span>{ascending ? "📉" : "📈"}</span>
            <span>Sort by: {ascending ? "Least" : "Most"} Collected</span>
          </button>
        </div>

        <div className="mt-6 rounded-xl border border-white/[0.06] bg-surface-raised">
          <div className={`grid ${activeCategory === "all" ? "grid-cols-5" : "grid-cols-4"} gap-4 px-6 py-3 border-b border-white/[0.06] bg-white/[0.04] text-xs font-bold uppercase tracking-wider text-zinc-300`}>
            <div className="flex items-center">
              <span className="text-gold">🏆</span>
              <span className="ml-2">Rank</span>
            </div>
            <div className="col-span-2 flex items-center">
              <span className="text-accent">🐾</span>
              <span className="ml-2">Beast</span>
            </div>
            <div className="flex items-center justify-end text-right">
              <span className="text-accent">📦</span>
              <span className="ml-2">Collected</span>
            </div>
            {activeCategory === "all" && (
              <div className="flex items-center justify-end text-right">
                <span className="text-red-400">⏳</span>
                <span className="ml-2">Remaining</span>
              </div>
            )}
          </div>

          {isInitialLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="text-center">
                <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-4 border-accent border-t-transparent" />
                <p className="text-zinc-400">Loading leaderboard...</p>
              </div>
            </div>
          ) : error && leaderboard.length === 0 ? (
            <div className="py-10 text-center">
              <p className="mb-3 text-red-400">❌ {error}</p>
              <button
                onClick={() => {
                  setPage(1);
                  setLeaderboard([]);
                  setHasMore(true);
                  setLoadState("loading");
                  setReloadNonce((prev) => prev + 1);
                }}
                className="rounded-lg border border-white/[0.06] bg-white/[0.04] px-5 py-2 text-sm font-bold uppercase tracking-wider text-zinc-300 transition-all duration-200 hover:bg-white/[0.08] hover:text-white"
              >
                Retry
              </button>
            </div>
          ) : (
            <div className="divide-y divide-white/[0.06]">
              {leaderboard.map((entry) => {
                const remaining = MAX_BEASTS_PER_TYPE - entry.value;
                return (
                  <div
                    key={`${entry.rank}-${entry.beast_name}-${activeCategory}-${ascending}`}
                    className={`grid ${activeCategory === "all" ? "grid-cols-5" : "grid-cols-4"} gap-4 px-6 py-3 transition-all duration-300 hover:bg-white/[0.04] ${
                      entry.rank <= 3
                        ? "bg-gradient-to-r from-yellow-500/5 to-orange-500/5"
                        : ""
                    }`}
                  >
                    <div className="flex items-center">
                      <div
                        className={`flex items-center gap-2 text-xl font-black ${
                          entry.rank === 1
                            ? "text-yellow-400"
                            : entry.rank === 2
                            ? "text-zinc-300"
                            : entry.rank === 3
                            ? "text-orange-400"
                            : "text-gold"
                        }`}
                      >
                        {entry.rank <= 3 && (
                          <span className="text-2xl">
                            {entry.rank === 1
                              ? "🥇"
                              : entry.rank === 2
                              ? "🥈"
                              : "🥉"}
                          </span>
                        )}
                        #{entry.rank}
                      </div>
                    </div>

                    <div className="col-span-2 flex items-center">
                      <span
                        className={`font-medium transition-all duration-200 ${
                          entry.rank <= 3
                            ? "text-white text-lg font-bold"
                            : "text-zinc-200"
                        }`}
                      >
                        {entry.beast_name}
                      </span>
                    </div>

                    <div className="flex items-center justify-end text-right">
                      <div>
                        <div
                          className="text-lg font-bold text-accent"
                        >
                          {entry.value.toLocaleString()}
                        </div>
                        <div className="text-xs uppercase tracking-wide text-zinc-500">
                          collected
                        </div>
                      </div>
                    </div>

                    {activeCategory === "all" && (
                      <div className="flex items-center justify-end text-right">
                        <div>
                          <div
                            className={`text-lg font-bold ${
                              remaining === 0
                                ? "text-zinc-500"
                                : remaining <= 10
                                ? "text-red-400"
                                : "text-orange-400"
                            }`}
                          >
                            {remaining.toLocaleString()}
                          </div>
                          <div className="text-xs uppercase tracking-wide text-zinc-500">
                            remaining
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {hasMore && leaderboard.length > 0 && (
          <div className="mt-4 text-center">
            <button
              onClick={handleLoadMore}
              disabled={loadState === "loading"}
              className="inline-flex items-center justify-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.04] px-6 py-2 text-sm font-bold uppercase tracking-wider text-zinc-300 transition-all duration-200 hover:bg-white/[0.08] hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loadState === "loading" ? (
                <>
                  <span className="h-5 w-5 animate-spin rounded-full border-2 border-accent border-t-transparent" />
                  Loading…
                </>
              ) : (
                "Load More"
              )}
            </button>
          </div>
        )}
        {!hasMore && leaderboard.length > 0 && (
          <div className="mt-4 text-center text-sm text-zinc-500">
            You've reached the end of the leaderboard
          </div>
        )}
      </div>
    </div>
  );
}

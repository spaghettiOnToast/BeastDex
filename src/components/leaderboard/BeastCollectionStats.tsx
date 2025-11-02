import { useEffect, useState } from "react";
import {
  fetchBeastRarityBeastLeaderboard,
  type BeastNameLeaderboardEntry,
  type BeastRarityLeaderboardCategory,
} from "../../services/beast";
import { useBeastHighlights } from "../../hooks/useBeastQueries";

const PAGE_SIZE = 10;

const CATEGORY_CONFIG: Array<{
  id: BeastRarityLeaderboardCategory;
  label: string;
  highlightClass: string;
  description: string;
}> = [
  {
    id: "all",
    label: "All",
    highlightClass: "from-[#8bff72] to-[#39ff14]",
    description: "Top collectors across every beast",
  },
  {
    id: "animatedShiny",
    label: "Animated Shiny",
    highlightClass: "from-[#ff7cf7] to-[#7dfbff]",
    description: "Collectors of animated shinies",
  },
  {
    id: "shiny",
    label: "Shiny",
    highlightClass: "from-[#ffe66d] to-[#ffaf1d]",
    description: "Shiniest beast hoarders",
  },
  {
    id: "animated",
    label: "Animated",
    highlightClass: "from-[#7dfbff] to-[#39ff14]",
    description: "Animated beast fanatics",
  },
  {
    id: "standard",
    label: "Standard",
    highlightClass: "from-gray-200 to-gray-400",
    description: "Champions of the classics",
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

  const { data: highlights, loading: highlightsLoading } = useBeastHighlights();

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
      gradient: "from-[#ff7cf7]/30 via-[#7dfbff]/10 to-[#39ff14]/30",
      accent: "text-[#ff7cf7]",
    },
    {
      label: "Shiny Beasts",
      value: highlights?.shinyCount ?? 0,
      gradient: "from-[#ffe66d]/30 via-[#ffaf1d]/10 to-[#ff6b35]/30",
      accent: "text-[#ffaf1d]",
    },
    {
      label: "Animated Beasts",
      value: highlights?.animatedCount ?? 0,
      gradient: "from-[#7dfbff]/30 via-[#39ff14]/10 to-[#1affd5]/30",
      accent: "text-[#39ff14]",
    },
    {
      label: "Standard Beasts",
      value: highlights?.standardCount ?? 0,
      gradient: "from-gray-500/30 via-gray-700/10 to-gray-900/30",
      accent: "text-gray-300",
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
            className={`relative overflow-hidden rounded-xl border border-gray-700/40 bg-gradient-to-br ${tile.gradient} p-5 shadow-lg`}
          >
            <div className="absolute inset-0 bg-gradient-to-br from-black/10 via-transparent to-black/40" />
            <div className="relative z-10">
              <div className="text-xs uppercase tracking-[0.3em] text-gray-400">
                {tile.label}
              </div>
              <div
                className={`mt-3 text-3xl font-black tracking-tight ${tile.accent}`}
              >
                {highlightsLoading && !highlights
                  ? "—"
                  : tile.value.toLocaleString()}
              </div>
              <div className="mt-2 text-xs text-gray-500">
                Total collected across all adventurers
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="bg-gray-900/60 backdrop-blur-sm border border-gray-700/40 rounded-xl p-4 shadow-2xl">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="text-xs uppercase tracking-[0.35em] text-gray-500">
              Leaderboard
            </div>
            <div className="mt-2 flex items-center gap-2 text-lg font-semibold text-white">
              <span
                className={`inline-flex items-center rounded-full border border-gray-700 bg-gradient-to-r ${activeCategoryMeta?.highlightClass ?? ""} px-3 py-1 text-xs font-bold uppercase tracking-wide text-gray-900`}
              >
                {activeCategoryMeta?.label ?? ""}
              </span>
              <span className="text-sm text-gray-400">
                {activeCategoryMeta?.description ?? ""}
              </span>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 rounded-xl bg-gray-900/60 p-1.5">
            {CATEGORY_CONFIG.map((category) => (
              <button
                key={category.id}
                onClick={() => setActiveCategory(category.id)}
                className={`min-w-[140px] rounded-lg px-4 py-2 text-sm font-bold uppercase tracking-wider transition-all duration-200 ${
                  activeCategory === category.id
                    ? "bg-gradient-to-r from-[#8bff72] to-[#39ff14] text-gray-900 shadow-[0_0_20px_rgba(139,255,114,0.25)]"
                    : "text-gray-300 hover:bg-gray-800/70 hover:text-[#8bff72]"
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
            className="inline-flex items-center gap-2 rounded-xl border border-gray-700 bg-gradient-to-r from-gray-800 to-gray-900 px-4 py-2 text-sm font-bold uppercase tracking-wider text-lsGold shadow-lg transition-all duration-200 hover:border-[#8bff72]/50 hover:bg-gray-800 hover:text-[#8bff72]"
          >
            <span>{ascending ? "📈" : "📉"}</span>
            <span>Sort by: {ascending ? "Least" : "Most"} Collected</span>
          </button>
        </div>

        <div className="mt-6 rounded-xl border border-gray-800/60 bg-gradient-to-br from-gray-900/90 to-black/70 shadow-inner">
          <div className="grid grid-cols-4 gap-4 px-6 py-3 border-b border-gray-700/30 bg-gray-900/70 text-xs font-bold uppercase tracking-wider text-gray-300">
            <div className="flex items-center">
              <span className="text-lsGold">🏆</span>
              <span className="ml-2">Rank</span>
            </div>
            <div className="col-span-2 flex items-center">
              <span className="text-[#8bff72]">🐾</span>
              <span className="ml-2">Beast</span>
            </div>
            <div className="flex items-center justify-end text-right">
              <span className="text-[#8bff72]">📦</span>
              <span className="ml-2">Total Collected</span>
            </div>
          </div>

          {isInitialLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="text-center">
                <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-4 border-lsGreen border-t-transparent" />
                <p className="text-gray-400">Loading leaderboard...</p>
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
                className="rounded-lg border border-gray-600/70 bg-gradient-to-r from-gray-800 to-gray-900 px-5 py-2 text-sm font-bold uppercase tracking-wider text-lsGold transition-all duration-200 hover:border-[#8bff72]/50 hover:bg-gray-800/70 hover:text-[#8bff72]"
              >
                Retry
              </button>
            </div>
          ) : (
            <div className="divide-y divide-gray-800/40">
              {leaderboard.map((entry) => (
                <div
                  key={`${entry.rank}-${entry.beast_name}-${activeCategory}-${ascending}`}
                  className={`grid grid-cols-4 gap-4 px-6 py-3 transition-all duration-300 hover:bg-gray-900/50 ${
                    entry.rank <= 3
                      ? "bg-gradient-to-r from-yellow-500/5 to-orange-500/5"
                      : ""
                  }`}
                >
                  <div className="flex items-center">
                    <div
                      className={`flex items-center gap-2 text-xl font-black ${
                        entry.rank === 1
                          ? "text-yellow-400 drop-shadow-[0_0_6px_rgba(255,215,0,0.6)]"
                          : entry.rank === 2
                          ? "text-gray-300 drop-shadow-[0_0_6px_rgba(192,192,192,0.6)]"
                          : entry.rank === 3
                          ? "text-orange-400 drop-shadow-[0_0_6px_rgba(255,165,0,0.6)]"
                          : "text-lsGold"
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
                          : "text-gray-200"
                      }`}
                    >
                      {entry.beast_name}
                    </span>
                  </div>

                  <div className="flex items-center justify-end text-right">
                    <div>
                      <div
                        className={`text-lg font-bold text-[#8bff72] ${
                          entry.rank <= 3
                            ? "drop-shadow-[0_0_4px_rgba(139,255,114,0.5)]"
                            : ""
                        }`}
                      >
                        {entry.value.toLocaleString()}
                      </div>
                      <div className="text-xs uppercase tracking-wide text-gray-500">
                        collected
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {hasMore && leaderboard.length > 0 && (
          <div className="mt-4 text-center">
            <button
              onClick={handleLoadMore}
              disabled={loadState === "loading"}
              className="inline-flex items-center justify-center gap-3 rounded-xl border border-gray-700 bg-gradient-to-r from-gray-800 to-gray-900 px-6 py-2 text-sm font-bold uppercase tracking-wider text-lsGold shadow-lg transition-all duration-200 hover:border-[#8bff72]/50 hover:bg-gray-800 hover:text-[#8bff72] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loadState === "loading" ? (
                <>
                  <span className="h-5 w-5 animate-spin rounded-full border-2 border-lsGold border-t-transparent" />
                  Loading…
                </>
              ) : (
                "Load More"
              )}
            </button>
          </div>
        )}
        {!hasMore && leaderboard.length > 0 && (
          <div className="mt-4 text-center text-sm text-gray-500">
            You've reached the end of the leaderboard
          </div>
        )}
      </div>
    </div>
  );
}

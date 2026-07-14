import { useEffect, useMemo, useState } from "react";
import {
  fetchBeastCollectedByName,
  fetchTierCollectionStats,
  MAX_BEASTS_PER_TYPE,
  MAX_BEASTS_PER_TIER,
  type BeastNameCount,
  type TierCollectionStats,
} from "../../services/beast";
import { useBeastHighlights } from "../../hooks/useBeastQueries";

const TIER_COLORS: Record<number, { text: string; gradient: string; border: string }> = {
  1: { text: "text-orange-400", gradient: "from-orange-500 to-orange-400", border: "border-orange-500/30" },
  2: { text: "text-purple-400", gradient: "from-purple-500 to-purple-400", border: "border-purple-500/30" },
  3: { text: "text-blue-400", gradient: "from-blue-500 to-blue-400", border: "border-blue-500/30" },
  4: { text: "text-green-400", gradient: "from-green-500 to-green-400", border: "border-green-500/30" },
  5: { text: "text-white", gradient: "from-gray-200 to-white", border: "border-gray-400/30" },
};

type LoadState = "loading" | "error" | "idle";

export function BeastCollectionStats() {
  const [beastCounts, setBeastCounts] = useState<BeastNameCount[]>([]);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [ascending, setAscending] = useState(false);
  const [search, setSearch] = useState("");
  const [tierStats, setTierStats] = useState<TierCollectionStats[]>([]);
  const [tierStatsLoading, setTierStatsLoading] = useState(true);

  const { data: highlights, loading: highlightsLoading } = useBeastHighlights();

  useEffect(() => {
    let cancelled = false;

    fetchTierCollectionStats()
      .then((data) => { if (!cancelled) { setTierStats(data); setTierStatsLoading(false); } })
      .catch(() => { if (!cancelled) setTierStatsLoading(false); });

    fetchBeastCollectedByName()
      .then((data) => { if (!cancelled) { setBeastCounts(data); setLoadState("idle"); } })
      .catch(() => { if (!cancelled) setLoadState("error"); });

    return () => { cancelled = true; };
  }, []);

  const displayed = useMemo(() => {
    let list = [...beastCounts];
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((b) => b.name.toLowerCase().includes(q));
    }
    list = list.sort(
      ascending
        ? (a, b) => a.collected - b.collected || a.name.localeCompare(b.name)
        : (a, b) => b.collected - a.collected || a.name.localeCompare(b.name)
    );
    return list.map((b, idx) => ({ ...b, rank: idx + 1, remaining: MAX_BEASTS_PER_TYPE - b.collected }));
  }, [beastCounts, ascending, search]);

  const summaryTiles = [
    { label: "Animated Shinies", value: highlights?.animatedShinyCount ?? 0, gradient: "from-pink-400/20 via-purple-400/10 to-accent/20", accent: "text-pink-400" },
    { label: "Shiny Beasts", value: highlights?.shinyCount ?? 0, gradient: "from-yellow-400/20 via-amber-400/10 to-orange-400/20", accent: "text-amber-400" },
    { label: "Animated Beasts", value: highlights?.animatedCount ?? 0, gradient: "from-sky-400/20 via-accent/10 to-teal-400/20", accent: "text-accent" },
    { label: "Standard Beasts", value: highlights?.standardCount ?? 0, gradient: "from-zinc-500/20 via-zinc-700/10 to-zinc-900/20", accent: "text-zinc-300" },
  ];

  const isLoading = loadState === "loading";

  return (
    <div className="space-y-6">
      {/* Summary tiles */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {summaryTiles.map((tile) => (
          <div
            key={tile.label}
            className={`relative overflow-hidden rounded-xl border border-white/[0.06] bg-gradient-to-br ${tile.gradient} p-5`}
          >
            <div className="absolute inset-0 bg-gradient-to-br from-black/10 via-transparent to-black/40" />
            <div className="relative z-10">
              <div className="text-xs uppercase tracking-[0.3em] text-zinc-400">{tile.label}</div>
              <div className={`mt-3 text-3xl font-black tracking-tight ${tile.accent}`}>
                {highlightsLoading && !highlights ? "—" : tile.value.toLocaleString()}
              </div>
              <div className="mt-2 text-xs text-zinc-500">Total collected across all adventurers</div>
            </div>
          </div>
        ))}
      </div>

      {/* Tier stats */}
      <div className="bg-surface-raised border border-white/[0.06] rounded-xl p-4">
        <div className="text-xs uppercase tracking-[0.35em] text-zinc-500 mb-4">Collection by Tier</div>
        <div className="grid gap-3 sm:grid-cols-5">
          {tierStatsLoading ? (
            <div className="col-span-5 flex justify-center py-4">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-accent border-t-transparent" />
            </div>
          ) : (
            [...tierStats].sort((a, b) => a.tier - b.tier).map((tier) => {
              const remaining = MAX_BEASTS_PER_TIER - tier.collected;
              const progress = Math.min((tier.collected / MAX_BEASTS_PER_TIER) * 100, 100);
              const colors = TIER_COLORS[tier.tier] ?? TIER_COLORS[5];
              return (
                <div key={tier.tier} className={`relative overflow-hidden rounded-lg border ${colors.border} bg-white/[0.04] p-3`}>
                  <div className="flex items-center justify-between mb-2">
                    <span className={`text-sm font-bold ${colors.text}`}>T{tier.tier}</span>
                    <span className="text-xs text-zinc-400">{progress.toFixed(1)}%</span>
                  </div>
                  <div className="h-1.5 w-full bg-white/[0.06] rounded-full overflow-hidden mb-2">
                    <div className={`h-full bg-gradient-to-r ${colors.gradient} transition-all`} style={{ width: `${progress}%` }} />
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className={`font-semibold ${colors.text}`}>{tier.collected.toLocaleString()}</span>
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

      {/* Per-beast remaining table */}
      <div className="bg-surface-raised border border-white/[0.06] rounded-xl p-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-4">
          <div className="text-xs uppercase tracking-[0.35em] text-zinc-500">Remaining to Collect — All 75 Beasts</div>
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search beast..."
              className="rounded-lg border border-white/[0.06] bg-white/[0.04] px-3 py-1.5 text-sm text-zinc-200 placeholder-zinc-600 outline-none focus:border-accent/50 w-40"
            />
            <button
              onClick={() => setAscending((v) => !v)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.06] bg-white/[0.04] px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-zinc-300 transition-all hover:bg-white/[0.08] hover:text-white whitespace-nowrap"
            >
              {ascending ? "📉 Least" : "📈 Most"} Collected
            </button>
          </div>
        </div>

        <div className="rounded-xl border border-white/[0.06] bg-surface-raised">
          <div className="grid grid-cols-5 gap-2 px-4 py-3 border-b border-white/[0.06] bg-white/[0.04] text-xs font-bold uppercase tracking-wider text-zinc-300">
            <div>Rank</div>
            <div className="col-span-2">Beast</div>
            <div className="text-right">Collected</div>
            <div className="text-right">Remaining</div>
          </div>

          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-accent border-t-transparent" />
              <p className="text-zinc-400 text-sm">Loading beast data from SDK…</p>
              <p className="text-zinc-600 text-xs">Fetching counts for all 75 beasts</p>
            </div>
          ) : loadState === "error" ? (
            <div className="py-10 text-center text-red-400 text-sm">Failed to load beast data</div>
          ) : displayed.length === 0 ? (
            <div className="py-10 text-center text-zinc-500 text-sm">No beasts match your search</div>
          ) : (
            <div className="divide-y divide-white/[0.06]">
              {displayed.map((entry) => (
                <div
                  key={entry.name}
                  className={`grid grid-cols-5 gap-2 px-4 py-2.5 transition-all hover:bg-white/[0.04] ${
                    entry.rank <= 3 ? "bg-gradient-to-r from-yellow-500/5 to-orange-500/5" : ""
                  }`}
                >
                  <div className="flex items-center">
                    <span className={`font-bold text-sm ${
                      entry.rank === 1 ? "text-yellow-400" : entry.rank === 2 ? "text-zinc-300" : entry.rank === 3 ? "text-orange-400" : "text-zinc-500"
                    }`}>
                      {entry.rank <= 3 ? (entry.rank === 1 ? "🥇" : entry.rank === 2 ? "🥈" : "🥉") : `#${entry.rank}`}
                    </span>
                  </div>
                  <div className="col-span-2 flex items-center">
                    <span className={`text-sm font-medium ${entry.rank <= 3 ? "text-white font-bold" : "text-zinc-200"}`}>
                      {entry.name}
                    </span>
                  </div>
                  <div className="flex items-center justify-end">
                    <span className="text-sm font-bold text-accent">{entry.collected.toLocaleString()}</span>
                  </div>
                  <div className="flex items-center justify-end">
                    <span className={`text-sm font-bold ${
                      entry.remaining === 0 ? "text-zinc-500" : entry.remaining <= 50 ? "text-red-400" : entry.remaining <= 200 ? "text-orange-400" : "text-zinc-300"
                    }`}>
                      {entry.remaining.toLocaleString()}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {!isLoading && beastCounts.length > 0 && (
          <p className="mt-3 text-center text-xs text-zinc-600">
            {beastCounts.length} beasts · max {MAX_BEASTS_PER_TYPE.toLocaleString()} each · cached 30 min
          </p>
        )}
      </div>
    </div>
  );
}

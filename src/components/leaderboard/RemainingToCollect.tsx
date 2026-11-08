import { useEffect, useMemo, useState } from "react";
import { fetchBeastCollectedByName, MAX_BEASTS_PER_TYPE, type BeastNameCount } from "../../services/beast";
import { useSpeciesCount } from "../../hooks/useBeastQueries";

type LoadState = "loading" | "error" | "idle";

/** Statistics → Remaining: how many of each species are collected / left to collect. */
export function RemainingToCollect() {
  const totalSpecies = useSpeciesCount();
  const [beastCounts, setBeastCounts] = useState<BeastNameCount[]>([]);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [ascending, setAscending] = useState(false);
  const [search, setSearch] = useState("");

  useEffect(() => {
    let cancelled = false;
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

  const isLoading = loadState === "loading";

  return (
      <div className="bg-surface-raised border border-white/[0.06] rounded-xl p-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-4">
          <div className="text-xs uppercase tracking-[0.35em] text-zinc-500">Remaining to Collect — All {totalSpecies} Beasts</div>
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
              <p className="text-zinc-600 text-xs">Fetching counts for all {totalSpecies} beasts</p>
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
  );
}

export default RemainingToCollect;

import { useEffect, useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { fetchPowerRankLeaderboard, type PowerRankLeaderboard } from "../../services/beast";
import { useControllerUsernames } from "../../hooks/useControllerUsernames";
import { normaliseStarknetAddress } from "../../utils/address";

const PAGE_SIZE = 10;

export function RankLeaderboard() {
  const [leaderboard, setLeaderboard] = useState<PowerRankLeaderboard>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);

  const ownerAddresses = useMemo(
    () => leaderboard.map(entry => entry.owner).filter(Boolean),
    [leaderboard]
  );
  const { usernames } = useControllerUsernames(ownerAddresses);

  useEffect(() => {
    async function loadLeaderboard() {
      try {
        setLoading(true);
        setError(null);

        const offset = (page - 1) * PAGE_SIZE;
        const data = await fetchPowerRankLeaderboard({ limit: PAGE_SIZE, offset });

        if (page === 1) {
          setLeaderboard(data);
        } else {
          setLeaderboard(prev => [...prev, ...data]);
        }

        setHasMore(data.length === PAGE_SIZE);
      } catch (err) {
        console.error("Failed to load power rank leaderboard:", err);
        setError("Failed to load leaderboard");
      } finally {
        setLoading(false);
      }
    }

    loadLeaderboard();
  }, [page]);

  const handleLoadMore = () => {
    if (!loading && hasMore) {
      setPage(prev => prev + 1);
    }
  };

  const getDisplayName = (owner: string) => {
    const normalised = normaliseStarknetAddress(owner);
    if (!normalised) return owner;
    const username = usernames[normalised.toLowerCase()];
    if (username) return username;
    if (normalised.length <= 12) return normalised;
    return `${normalised.slice(0, 6)}…${normalised.slice(-4)}`;
  };

  const getDisplayClass = (owner: string) => {
    const normalised = normaliseStarknetAddress(owner);
    if (!normalised) return "font-mono";
    const username = usernames[normalised.toLowerCase()];
    return username ? "" : "font-mono";
  };

  if (loading && page === 1) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <div className="animate-spin h-8 w-8 border-4 border-accent border-t-transparent rounded-full mx-auto mb-4"></div>
          <p className="text-zinc-400">Loading leaderboard...</p>
        </div>
      </div>
    );
  }

  if (error && page === 1) {
    return (
      <div className="text-center py-12">
        <p className="text-red-400 mb-4">❌ {error}</p>
        <button
          onClick={() => setPage(1)}
          className="px-6 py-3 bg-accent text-surface font-bold rounded-lg hover:scale-105 transition-transform uppercase tracking-wider"
        >
          Try Again
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="bg-surface-raised border border-white/[0.06] rounded-xl overflow-hidden">
        <div className="grid grid-cols-4 gap-4 px-6 py-3 bg-white/[0.04] border-b border-white/[0.06] text-xs font-bold uppercase tracking-wider text-zinc-300">
          <div className="flex items-center">
            <span className="text-gold">🏆</span>
            <span className="ml-2">Rank</span>
          </div>
          <div className="col-span-2 flex items-center">
            <span className="text-accent">👤</span>
            <span className="ml-2">Player</span>
          </div>
          <div className="text-right flex items-center justify-end">
            <span className="text-accent">⚡</span>
            <span className="ml-2">Total Power</span>
          </div>
        </div>

        <div className="divide-y divide-white/[0.06]">
          {leaderboard.map((entry) => {
            const normalised = normaliseStarknetAddress(entry.owner);
            return (
              <div
                key={`${entry.rank}-${entry.owner}`}
                className={`
                  grid grid-cols-4 gap-4 px-6 py-3 hover:bg-white/[0.04] transition-all duration-300 group
                  ${entry.rank <= 3 ? "bg-gradient-to-r from-yellow-500/5 to-orange-500/5" : ""}
                `}
              >
                <div className="flex items-center">
                  <div className={`
                    text-xl font-black flex items-center gap-2
                    ${entry.rank === 1 ? "text-yellow-400" :
                      entry.rank === 2 ? "text-zinc-300" :
                      entry.rank === 3 ? "text-orange-400" :
                      "text-gold"}
                  `}>
                    {entry.rank <= 3 && (
                      <span className="text-2xl">
                        {entry.rank === 1 ? "🥇" : entry.rank === 2 ? "🥈" : "🥉"}
                      </span>
                    )}
                    #{entry.rank}
                  </div>
                </div>

                <div className="col-span-2 flex items-center">
                  {normalised ? (
                    <Link
                      to={`/collection/${encodeURIComponent(normalised)}`}
                      className={`
                        hover:text-accent transition-all duration-200 group-hover:scale-105 font-medium
                        ${getDisplayClass(entry.owner)}
                        ${entry.rank <= 3 ? "text-white font-bold" : "text-zinc-200"}
                      `}
                    >
                      {getDisplayName(entry.owner)}
                    </Link>
                  ) : (
                    <span className={`text-zinc-400 ${getDisplayClass(entry.owner)}`}>
                      {getDisplayName(entry.owner)}
                    </span>
                  )}
                </div>

                <div className="text-right flex items-center justify-end">
                  <div className="text-right">
                    <div className="font-bold text-accent">
                      {entry.value.toLocaleString()}
                    </div>
                    <div className="text-xs text-zinc-500 uppercase tracking-wide">power</div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {hasMore && (
        <div className="text-center">
          <button
            onClick={handleLoadMore}
            disabled={loading}
            className="px-6 py-2 bg-white/[0.04] text-zinc-300 hover:text-white hover:bg-white/[0.08] disabled:opacity-50 transition-all duration-300 rounded-xl text-sm font-bold uppercase tracking-wider border border-white/[0.06]"
          >
            {loading ? (
              <span className="flex items-center gap-3">
                <div className="w-5 h-5 border-2 border-gold border-t-transparent rounded-full animate-spin"></div>
                Loading More...
              </span>
            ) : (
              "Load More"
            )}
          </button>
        </div>
      )}

      {!hasMore && leaderboard.length > 0 && (
        <div className="text-center py-4">
          <p className="text-zinc-500 text-sm">You've reached the end of the leaderboard</p>
        </div>
      )}
    </div>
  );
}

import { useEffect, useState } from "react";
import { fetchMostCollectedBeastLeaderboard } from "../../services/beast";

const PAGE_SIZE = 10;

type BeastNameEntry = {
  rank: number;
  beast_name: string;
  value: number;
};

export function MostCollectedBeast() {
  const [leaderboard, setLeaderboard] = useState<BeastNameEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);

  useEffect(() => {
    async function loadLeaderboard() {
      try {
        setLoading(true);
        setError(null);

        const offset = (page - 1) * PAGE_SIZE;
        const data = await fetchMostCollectedBeastLeaderboard({ limit: PAGE_SIZE, offset });

        if (page === 1) {
          setLeaderboard(data);
        } else {
          setLeaderboard(prev => [...prev, ...data]);
        }

        setHasMore(data.length === PAGE_SIZE);
      } catch (err) {
        console.error("Failed to load most collected beast leaderboard:", err);
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

  if (loading && page === 1) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <div className="animate-spin h-8 w-8 border-4 border-lsGreen border-t-transparent rounded-full mx-auto mb-4"></div>
          <p className="text-gray-400">Loading leaderboard...</p>
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
          className="text-lsGold hover:text-lsGreen transition-colors"
        >
          Try again
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Leaderboard Table */}
      <div className="bg-gradient-to-br from-gray-900/90 to-black/60 backdrop-blur-sm border border-gray-700/50 rounded-xl overflow-hidden shadow-2xl">
        <div className="grid grid-cols-4 gap-4 px-6 py-3 bg-gradient-to-r from-gray-800/80 to-gray-900/80 border-b border-gray-600/30 text-xs font-bold uppercase tracking-wider text-gray-300">
          <div className="flex items-center">
            <span className="text-lsGold">🏆</span>
            <span className="ml-2">Rank</span>
          </div>
          <div className="col-span-2 flex items-center">
            <span className="text-[#8bff72]">🐾</span>
            <span className="ml-2">Beast Name</span>
          </div>
          <div className="text-right flex items-center justify-end">
            <span className="text-[#8bff72]">🔥</span>
            <span className="ml-2">Total Collected</span>
          </div>
        </div>

        <div className="divide-y divide-gray-700/30">
          {leaderboard.map((entry) => (
            <div
              key={`${entry.rank}-${entry.beast_name}`}
              className={`
                grid grid-cols-4 gap-4 px-6 py-3 hover:bg-gradient-to-r hover:from-gray-800/40 hover:to-gray-900/40 transition-all duration-300 group
                ${entry.rank <= 3 ? "bg-gradient-to-r from-yellow-500/5 to-orange-500/5" : ""}
              `}
            >
              {/* Rank */}
              <div className="flex items-center">
                <div className={`
                  text-xl font-black flex items-center gap-2
                  ${entry.rank === 1 ? "text-yellow-400 drop-shadow-[0_0_8px_rgba(255,215,0,0.6)]" :
                    entry.rank === 2 ? "text-gray-300 drop-shadow-[0_0_8px_rgba(192,192,192,0.6)]" :
                    entry.rank === 3 ? "text-orange-400 drop-shadow-[0_0_8px_rgba(255,165,0,0.6)]" :
                    "text-lsGold"}
                `}>
                  {entry.rank <= 3 && (
                    <span className="text-2xl">
                      {entry.rank === 1 ? "🥇" : entry.rank === 2 ? "🥈" : "🥉"}
                    </span>
                  )}
                  #{entry.rank}
                </div>
              </div>

              {/* Beast Name */}
              <div className="col-span-2 flex items-center">
                <span className={`
                  font-medium transition-all duration-200 group-hover:scale-105
                  ${entry.rank <= 3 ? "text-white font-bold text-lg" : "text-gray-200"}
                `}>
                  {entry.beast_name}
                </span>
              </div>

              {/* Collection Count */}
              <div className="text-right flex items-center justify-end">
                <div className="text-right">
                  <div className={`
                    font-bold
                    ${entry.rank <= 3 ? "text-[#8bff72] drop-shadow-[0_0_6px_rgba(139,255,114,0.4)]" : "text-[#8bff72]"}
                  `}>
                    {entry.value.toLocaleString()}
                  </div>
                  <div className="text-xs text-gray-500 uppercase tracking-wide">collected</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Load More Button */}
      {hasMore && (
        <div className="text-center">
          <button
            onClick={handleLoadMore}
            disabled={loading}
            className="px-6 py-2 bg-gradient-to-r from-gray-800 to-gray-900 hover:from-lsGold/20 hover:to-[#8bff72]/20 disabled:opacity-50 text-lsGold hover:text-[#8bff72] transition-all duration-300 rounded-xl text-sm font-bold uppercase tracking-wider border border-gray-700 hover:border-[#8bff72]/50 shadow-lg hover:shadow-[#8bff72]/20"
          >
            {loading ? (
              <span className="flex items-center gap-3">
                <div className="w-5 h-5 border-2 border-lsGold border-t-transparent rounded-full animate-spin"></div>
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
          <p className="text-gray-500 text-sm">You've reached the end of the leaderboard</p>
        </div>
      )}
    </div>
  );
}
import { useEffect, useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { fetchBeastOfTheDayLeaderboard } from "../../services/beast";
import { useControllerUsernames } from "../../hooks/useControllerUsernames";
import { normaliseStarknetAddress } from "../../utils/address";
import type { Beast } from "../../services/beast";

const PAGE_SIZE = 10;

type BeastOfTheDayEntry = {
  rank: number;
  beast: Beast;
  owner: string;
  rarity_score: number;
  power: number;
  beast_rank: number;
  last_death: number;
};

const getRarityInfo = (rarityScore: number, beast: any) => {
  switch (rarityScore) {
    case 3:
      return { label: "Shiny Animated", color: "bg-gradient-to-r from-pink-400 via-purple-400 to-blue-400", icon: "✨🎬" };
    case 2:
      // Check if it's shiny or animated to show the correct label
      const isShiny = beast.attributes?.some((attr: any) =>
        attr.trait_type?.toLowerCase() === 'shiny' && (attr.value === '1' || attr.value === 1)
      );
      const isAnimated = beast.attributes?.some((attr: any) =>
        attr.trait_type?.toLowerCase() === 'animated' && (attr.value === '1' || attr.value === 1)
      );

      if (isShiny && !isAnimated) {
        return { label: "Shiny", color: "bg-yellow-300", icon: "⭐" };
      } else if (isAnimated && !isShiny) {
        return { label: "Animated", color: "bg-sky-400", icon: "⚡" };
      } else {
        return { label: "Shiny/Animated", color: "bg-gradient-to-r from-yellow-300 to-sky-400", icon: "⭐⚡" };
      }
    default:
      return { label: "Standard", color: "bg-white", icon: "🐾" };
  }
};

const formatTimeAgo = (timestamp: number) => {
  const now = Math.floor(Date.now() / 1000);
  const diff = now - timestamp;
  const hours = Math.floor(diff / 3600);
  const minutes = Math.floor((diff % 3600) / 60);

  if (hours > 0) {
    return `${hours}h ${minutes}m ago`;
  }
  return `${minutes}m ago`;
};

export function BeastOfTheDay() {
  const [leaderboard, setLeaderboard] = useState<BeastOfTheDayEntry[]>([]);
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
        const data = await fetchBeastOfTheDayLeaderboard({ limit: PAGE_SIZE, offset });

        if (page === 1) {
          setLeaderboard(data);
        } else {
          setLeaderboard(prev => [...prev, ...data]);
        }

        setHasMore(data.length === PAGE_SIZE);
      } catch (err) {
        console.error("Failed to load beast of the day leaderboard:", err);
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
          <div className="animate-spin h-8 w-8 border-4 border-lsGreen border-t-transparent rounded-full mx-auto mb-4"></div>
          <p className="text-gray-400">Loading beast of the day...</p>
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
          className="px-6 py-3 bg-gradient-to-r from-lsGold to-lsGreen text-black font-bold rounded-lg hover:scale-105 transition-transform shadow-lg hover:shadow-lsGreen/50 uppercase tracking-wider"
        >
          Try Again
        </button>
      </div>
    );
  }

  if (leaderboard.length === 0 && !loading) {
    return (
      <div className="text-center py-12">
        <div className="text-6xl mb-4">💤</div>
        <p className="text-gray-400 text-lg mb-2">No beasts fell today</p>
        <p className="text-gray-500 text-sm">Check back later for fallen warriors from the past 24 hours</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Leaderboard Table */}
      <div className="bg-gradient-to-br from-gray-900/90 to-black/60 backdrop-blur-sm border border-gray-700/50 rounded-xl overflow-hidden shadow-2xl">
        <div className="grid grid-cols-7 gap-4 px-6 py-3 bg-gradient-to-r from-gray-800/80 to-gray-900/80 border-b border-gray-600/30 text-xs font-bold uppercase tracking-wider text-gray-300">
          <div className="flex items-center">
            <span className="text-lsGold">🏆</span>
            <span className="ml-2">Rank</span>
          </div>
          <div className="col-span-2 flex items-center">
            <span className="text-[#8bff72]">🐾</span>
            <span className="ml-2">Beast</span>
          </div>
          <div className="flex items-center">
            <span className="text-purple-400">✨</span>
            <span className="ml-2">Rarity</span>
          </div>
          <div className="text-center flex items-center justify-center">
            <span className="text-[#8bff72]">🔥</span>
            <span className="ml-2">Power</span>
          </div>
          <div className="flex items-center">
            <span className="text-[#8bff72]">🎯</span>
            <span className="ml-2">Owner</span>
          </div>
          <div className="text-right flex items-center justify-end">
            <span className="text-red-400">💀</span>
            <span className="ml-2">Death</span>
          </div>
        </div>

        <div className="divide-y divide-gray-700/30">
          {leaderboard.map((entry) => {
            const normalised = normaliseStarknetAddress(entry.owner);
            const rarityInfo = getRarityInfo(entry.rarity_score, entry.beast);

            return (
              <div
                key={`${entry.rank}-${entry.beast.id}`}
                className={`
                  grid grid-cols-7 gap-4 px-6 py-3 hover:bg-gradient-to-r hover:from-gray-800/40 hover:to-gray-900/40 transition-all duration-300 group
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
                    ${entry.rank <= 3 ? "text-white font-bold" : "text-gray-200"}
                  `}>
                    {entry.beast.name}
                  </span>
                  <span className="ml-2 text-xs text-gray-500">#{entry.beast_rank}</span>
                </div>

                {/* Rarity */}
                <div className="flex items-center">
                  <div className={`
                    px-2 py-1 rounded-md text-xs font-bold text-black flex items-center gap-1
                    ${rarityInfo.color}
                  `}>
                    <span>{rarityInfo.icon}</span>
                    <span className="hidden sm:inline">{rarityInfo.label}</span>
                  </div>
                </div>

                {/* Power */}
                <div className="text-center flex items-center justify-center">
                  <div className="text-center">
                    <div className={`
                      font-bold
                      ${entry.rank <= 3 ? "text-[#8bff72] drop-shadow-[0_0_6px_rgba(139,255,114,0.4)]" : "text-[#8bff72]"}
                    `}>
                      {entry.power.toLocaleString()}
                    </div>
                  </div>
                </div>

                {/* Owner */}
                <div className="flex items-center">
                  {normalised ? (
                    <Link
                      to={`/collection/${encodeURIComponent(normalised)}`}
                      className={`
                        hover:text-[#8bff72] transition-all duration-200 group-hover:scale-105 font-medium text-sm
                        ${getDisplayClass(entry.owner)}
                        ${entry.rank <= 3 ? "text-white font-bold" : "text-gray-200"}
                      `}
                    >
                      {getDisplayName(entry.owner)}
                    </Link>
                  ) : (
                    <span className={`text-gray-400 text-sm ${getDisplayClass(entry.owner)}`}>
                      {getDisplayName(entry.owner)}
                    </span>
                  )}
                </div>

                {/* Death Time */}
                <div className="text-right flex items-center justify-end">
                  <div className="text-right">
                    <div className="text-red-400 text-sm font-medium">
                      {formatTimeAgo(entry.last_death)}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
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
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { fetchBeastSlayerLeaderboard, type BeastSlayerEntry } from "../../services/beast";
import { useControllerUsernames } from "../../hooks/useControllerUsernames";
import { normaliseStarknetAddress } from "../../utils/address";

const PAGE_SIZE = 10;

export function BeastSlayerLeaderboard() {
  const [entries, setEntries] = useState<BeastSlayerEntry[]>([]);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [reloadNonce, setReloadNonce] = useState(0);

  const ownerAddresses = useMemo(
    () => entries.map((entry) => entry.owner).filter((owner): owner is string => Boolean(owner)),
    [entries]
  );
  const { usernames } = useControllerUsernames(ownerAddresses);

  useEffect(() => {
    let cancelled = false;

    async function loadLeaderboard() {
      try {
        setLoading(true);
        setError(null);

        const offset = (page - 1) * PAGE_SIZE;
        const data = await fetchBeastSlayerLeaderboard({ limit: PAGE_SIZE, offset });
        if (cancelled) return;

        if (page === 1) {
          setEntries(data);
        } else {
          setEntries((prev) => [...prev, ...data]);
        }

        setHasMore(data.length === PAGE_SIZE);
      } catch (err) {
        if (cancelled) return;
        console.error("Failed to load beast slayer leaderboard:", err);
        setError("Failed to load leaderboard");
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadLeaderboard();

    return () => {
      cancelled = true;
    };
  }, [page, reloadNonce]);

  const handleLoadMore = () => {
    if (!loading && hasMore) {
      setPage((prev) => prev + 1);
    }
  };

  const resolveOwnerDisplay = (owner: string | null) => {
    if (!owner) return { label: "Unclaimed", className: "text-gray-500 font-mono" };

    const normalised = normaliseStarknetAddress(owner);
    if (!normalised) {
      return { label: owner, className: "font-mono text-gray-300" };
    }

    const username = usernames[normalised.toLowerCase()];
    if (username) {
      return { label: username, className: "text-gray-200" };
    }

    const label =
      normalised.length <= 12
        ? normalised
        : `${normalised.slice(0, 6)}…${normalised.slice(-4)}`;

    return { label, className: "font-mono text-gray-300" };
  };

  if (loading && page === 1) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-4 border-lsGreen border-t-transparent" />
          <p className="text-gray-400">Loading leaderboard...</p>
        </div>
      </div>
    );
  }

  if (error && entries.length === 0) {
    return (
      <div className="py-12 text-center">
        <p className="mb-4 text-red-400">❌ {error}</p>
        <button
          onClick={() => {
            setPage(1);
            setEntries([]);
            setHasMore(true);
            setLoading(true);
            setReloadNonce((prev) => prev + 1);
          }}
          className="rounded-lg border border-gray-700 bg-gradient-to-r from-gray-800 to-gray-900 px-6 py-2 text-sm font-bold uppercase tracking-wider text-lsGold transition-all duration-200 hover:border-[#8bff72]/50 hover:bg-gray-800 hover:text-[#8bff72]"
        >
          Try Again
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-xl border border-gray-700/50 bg-gradient-to-br from-gray-900/90 to-black/70 shadow-2xl">
        <div className="grid grid-cols-[90px_minmax(0,2fr)_minmax(0,1.4fr)_minmax(0,1fr)] gap-4 border-b border-gray-600/30 bg-gradient-to-r from-gray-800/80 to-gray-900/80 px-6 py-3 text-xs font-bold uppercase tracking-wider text-gray-300">
          <div className="flex items-center">
            <span className="text-lsGold">⚔️</span>
            <span className="ml-2">Rank</span>
          </div>
          <div className="flex items-center">
            <span className="text-[#7dfbff]">🐲</span>
            <span className="ml-2">Beast</span>
          </div>
          <div className="flex items-center">
            <span className="text-[#ff7cf7]">👑</span>
            <span className="ml-2">Owner</span>
          </div>
          <div className="flex items-center justify-end">
            <span className="text-[#ff6b35]">💀</span>
            <span className="ml-2">Adventurers Killed</span>
          </div>
        </div>

        <div className="divide-y divide-gray-700/30">
          {entries.map((entry) => {
            const ownerInfo = resolveOwnerDisplay(entry.owner);

            return (
              <div
                key={`${entry.beastId}-${entry.rank}`}
                className={`grid grid-cols-[90px_minmax(0,2fr)_minmax(0,1.4fr)_minmax(0,1fr)] gap-4 px-6 py-3 transition-all duration-300 hover:bg-gradient-to-r hover:from-gray-800/40 hover:to-gray-900/40 ${
                  entry.rank <= 3
                    ? "bg-gradient-to-r from-red-500/10 via-orange-500/5 to-transparent"
                    : ""
                }`}
              >
                <div className="flex items-center">
                  <div
                    className={`flex items-center gap-2 text-xl font-black ${
                      entry.rank === 1
                        ? "text-red-400 drop-shadow-[0_0_8px_rgba(255,107,53,0.6)]"
                        : entry.rank === 2
                        ? "text-orange-300 drop-shadow-[0_0_8px_rgba(255,165,0,0.45)]"
                        : entry.rank === 3
                        ? "text-yellow-400 drop-shadow-[0_0_8px_rgba(255,215,0,0.45)]"
                        : "text-lsGold"
                    }`}
                  >
                    {entry.rank <= 3 && (
                      <span className="text-2xl">
                        {entry.rank === 1
                          ? "👑"
                          : entry.rank === 2
                          ? "🔥"
                          : "⚡"}
                      </span>
                    )}
                    #{entry.rank}
                  </div>
                </div>

                <div className="flex items-center">
                  <Link
                    to={`/beasts/${encodeURIComponent(entry.beastId)}`}
                    className="text-base font-semibold text-gray-100 transition-all duration-200 hover:text-[#7dfbff]"
                  >
                    {entry.beastName}
                  </Link>
                </div>

                <div className="flex items-center">
                  {entry.owner ? (
                    <Link
                      to={`/account/${encodeURIComponent(normaliseStarknetAddress(entry.owner) ?? entry.owner)}`}
                      className={`transition-all duration-200 hover:text-[#ff7cf7] ${ownerInfo.className}`}
                    >
                      {ownerInfo.label}
                    </Link>
                  ) : (
                    <span className={ownerInfo.className}>{ownerInfo.label}</span>
                  )}
                </div>

                <div className="flex items-center justify-end">
                  <div className="text-right">
                    <div className="text-lg font-black text-[#ff6b35] drop-shadow-[0_0_6px_rgba(255,107,53,0.45)]">
                      {entry.kills.toLocaleString()}
                    </div>
                    <div className="text-xs uppercase tracking-wide text-gray-500">
                      kills
                    </div>
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
            className="inline-flex items-center gap-3 rounded-xl border border-gray-700 bg-gradient-to-r from-gray-800 to-gray-900 px-6 py-2 text-sm font-bold uppercase tracking-wider text-lsGold shadow-lg transition-all duration-200 hover:border-[#ff6b35]/50 hover:bg-gray-800 hover:text-[#ff6b35] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? (
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
    </div>
  );
}

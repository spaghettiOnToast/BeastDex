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
  // "desc" = most kills first
  const [order, setOrder] = useState<"asc" | "desc">("desc");
  // Genesis beasts dominate all-time kills: hidden by default
  const [showGenesis, setShowGenesis] = useState(false);
  const resetList = () => {
    setPage(1);
    setEntries([]);
    setHasMore(true);
  };
  const toggleOrder = () => {
    setOrder((o) => (o === "desc" ? "asc" : "desc"));
    resetList();
  };
  const toggleGenesis = () => {
    setShowGenesis((v) => !v);
    resetList();
  };

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
        const data = await fetchBeastSlayerLeaderboard({ limit: PAGE_SIZE, offset, order, includeGenesis: showGenesis });
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
  }, [page, reloadNonce, order, showGenesis]);

  const handleLoadMore = () => {
    if (!loading && hasMore) {
      setPage((prev) => prev + 1);
    }
  };

  const resolveOwnerDisplay = (owner: string | null) => {
    if (!owner) return { label: "Unclaimed", className: "text-zinc-500 font-mono" };

    const normalised = normaliseStarknetAddress(owner);
    if (!normalised) {
      return { label: owner, className: "font-mono text-zinc-300" };
    }

    const username = usernames[normalised.toLowerCase()];
    if (username) {
      return { label: username, className: "text-zinc-200" };
    }

    const label =
      normalised.length <= 12
        ? normalised
        : `${normalised.slice(0, 6)}…${normalised.slice(-4)}`;

    return { label, className: "font-mono text-zinc-300" };
  };

  if (loading && page === 1) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-4 border-accent border-t-transparent" />
          <p className="text-zinc-400">Loading leaderboard...</p>
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
          className="rounded-lg border border-white/[0.06] bg-white/[0.04] px-6 py-2 text-sm font-bold uppercase tracking-wider text-zinc-300 transition-all duration-200 hover:bg-white/[0.08] hover:text-white"
        >
          Try Again
        </button>
      </div>
    );
  }

  const medals = order === "desc";

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-zinc-500">
          All-time adventurer kills across all beasts — pre-v3 (legacy) kills plus kills since the v3 migration.
        </p>
        <div className="flex shrink-0 gap-2 self-start sm:self-auto">
          <button
            type="button"
            onClick={toggleGenesis}
            disabled={loading}
            aria-pressed={showGenesis}
            className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-bold uppercase tracking-wider transition-all disabled:opacity-60 ${
              showGenesis
                ? "border-[#e2b94c]/50 bg-[#e2b94c]/10 text-[#e2b94c]"
                : "border-white/[0.06] bg-white/[0.04] text-zinc-300 hover:bg-white/[0.08] hover:text-white"
            }`}
            title="Genesis beasts (one per species, held by one wallet) are hidden by default"
          >
            {showGenesis ? "✓ Genesis shown" : "Show Genesis"}
          </button>
          <button
            type="button"
            onClick={toggleOrder}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.06] bg-white/[0.04] px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-zinc-300 transition-all hover:bg-white/[0.08] hover:text-white disabled:opacity-60"
            title="Toggle sort order"
          >
            {order === "desc" ? "💀 Most kills first" : "🕊️ Fewest kills first"}
          </button>
        </div>
      </div>
      <div className="overflow-hidden rounded-xl border border-white/[0.06] bg-surface-raised">
        <div className="grid grid-cols-[90px_minmax(0,2fr)_minmax(0,1.4fr)_minmax(0,1fr)] gap-4 border-b border-white/[0.06] bg-white/[0.04] px-6 py-3 text-xs font-bold uppercase tracking-wider text-zinc-300">
          <div className="flex items-center">
            <span className="text-gold">⚔️</span>
            <span className="ml-2">Rank</span>
          </div>
          <div className="flex items-center">
            <span className="text-gold">🐲</span>
            <span className="ml-2">Beast</span>
          </div>
          <div className="flex items-center">
            <span className="text-gold">👑</span>
            <span className="ml-2">Owner</span>
          </div>
          <div className="flex items-center justify-end">
            <span className="text-[#ff6b35]">💀</span>
            <span className="ml-2">Adventurers Killed</span>
          </div>
        </div>

        <div className="divide-y divide-white/[0.06]">
          {entries.map((entry) => {
            const ownerInfo = resolveOwnerDisplay(entry.owner);

            return (
              <div
                key={`${entry.beastId}-${entry.rank}`}
                className={`grid grid-cols-[90px_minmax(0,2fr)_minmax(0,1.4fr)_minmax(0,1fr)] gap-4 px-6 py-3 transition-all duration-300 hover:bg-white/[0.04] ${
                  medals && entry.rank <= 3
                    ? "bg-gradient-to-r from-red-500/10 via-orange-500/5 to-transparent"
                    : ""
                }`}
              >
                <div className="flex items-center">
                  <div
                    className={`flex items-center gap-2 text-xl font-black ${
                      !medals
                        ? "text-gold"
                        : entry.rank === 1
                        ? "text-red-400"
                        : entry.rank === 2
                        ? "text-orange-300"
                        : entry.rank === 3
                        ? "text-yellow-400"
                        : "text-gold"
                    }`}
                  >
                    {medals && entry.rank <= 3 && (
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
                  {entry.inV3 ? (
                    <Link
                      to={`/beasts/${encodeURIComponent(entry.beastId)}`}
                      className="truncate text-base font-semibold text-zinc-100 transition-all duration-200 hover:text-gold"
                    >
                      {entry.beastName}
                    </Link>
                  ) : (
                    <span className="truncate text-base font-semibold text-zinc-300" title="Not found in the v3 collection">
                      {entry.beastName}
                    </span>
                  )}
                  {entry.beastRank > 0 && <span className="ml-2 shrink-0 text-xs text-zinc-500">#{entry.beastRank}</span>}
                  {entry.genesis && (
                    <span className="ml-2 shrink-0 rounded border border-[#e2b94c]/50 px-1 text-[9px] font-bold uppercase tracking-wider text-[#e2b94c]">
                      Genesis
                    </span>
                  )}
                  {!entry.inV3 && (
                    <span className="ml-2 shrink-0 rounded border border-white/10 px-1 text-[9px] uppercase tracking-wider text-zinc-500">
                      legacy
                    </span>
                  )}
                </div>

                <div className="flex items-center">
                  {entry.owner ? (
                    <Link
                      to={`/collection/${encodeURIComponent(normaliseStarknetAddress(entry.owner) ?? entry.owner)}`}
                      className={`transition-all duration-200 hover:text-gold ${ownerInfo.className}`}
                    >
                      {ownerInfo.label}
                    </Link>
                  ) : (
                    <span className={ownerInfo.className}>{ownerInfo.label}</span>
                  )}
                </div>

                <div className="flex items-center justify-end">
                  <div className="text-right">
                    <div className="text-lg font-black text-[#ff6b35]">
                      {entry.kills.toLocaleString()}
                    </div>
                    <div className="text-xs uppercase tracking-wide text-zinc-500">
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
            className="inline-flex items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.04] px-6 py-2 text-sm font-bold uppercase tracking-wider text-zinc-300 transition-all duration-200 hover:bg-white/[0.08] hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? (
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
    </div>
  );
}

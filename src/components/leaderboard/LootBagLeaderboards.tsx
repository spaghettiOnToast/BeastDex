import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  fetchLootLeaderboards,
  LOOT_BAG_URL,
  type LootLeaderboardEntry,
  type LootLeaderboards,
} from "../../services/lootDungeon";
import { useControllerUsernames } from "../../hooks/useControllerUsernames";
import { normaliseStarknetAddress } from "../../utils/address";

const PAGE_SIZE = 10;

const BOARDS: Array<{ key: keyof LootLeaderboards; title: string; icon: string; unit: string; blurb: string; color: string }> = [
  { key: "slain", title: "Most Slain", icon: "⚔️", unit: "slain", blurb: "Loot beasts slain and claimed", color: "text-[#8bff72]" },
  { key: "staked", title: "Most Staked", icon: "🎒", unit: "staked", blurb: "Beasts staked for Mega, all time", color: "text-[#7dfbff]" },
  { key: "lost", title: "Most Lost", icon: "💀", unit: "lost", blurb: "Staked beasts taken by other players", color: "text-[#ff6b35]" },
];

export function LootBagLeaderboards() {
  const [data, setData] = useState<LootLeaderboards | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    fetchLootLeaderboards()
      .then((d) => !cancelled && setData(d))
      .catch((err) => {
        console.error("Failed to load Loot Bag leaderboards:", err);
        if (!cancelled) setError("Failed to load Loot Bag leaderboards");
      });
    return () => {
      cancelled = true;
    };
  }, [nonce]);

  const addresses = useMemo(
    () => (data ? [...new Set(BOARDS.flatMap((b) => data[b.key].map((e) => e.address)))] : []),
    [data],
  );
  const { usernames } = useControllerUsernames(addresses);

  if (error && !data) {
    return (
      <div className="py-12 text-center">
        <p className="mb-4 text-red-400">❌ {error}</p>
        <button
          onClick={() => setNonce((n) => n + 1)}
          className="rounded-lg border border-white/[0.06] bg-white/[0.04] px-6 py-2 text-sm font-bold uppercase tracking-wider text-zinc-300 transition-all duration-200 hover:bg-white/[0.08] hover:text-white"
        >
          Try Again
        </button>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-4 border-accent border-t-transparent" />
          <p className="text-zinc-400">Reading the Loot Dungeon…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-zinc-500">
        Read live from the{" "}
        <a href={LOOT_BAG_URL} target="_blank" rel="noreferrer" className="text-zinc-300 hover:text-gold">
          Loot Bag
        </a>{" "}
        (Loot Dungeon) contract events on chain.
      </p>
      <div className="grid gap-4 lg:grid-cols-3">
        {BOARDS.map((b) => (
          <Board key={b.key} board={b} entries={data[b.key]} usernames={usernames} />
        ))}
      </div>
    </div>
  );
}

function Board({
  board,
  entries,
  usernames,
}: {
  board: (typeof BOARDS)[number];
  entries: LootLeaderboardEntry[];
  usernames: Record<string, string>;
}) {
  const [shown, setShown] = useState(PAGE_SIZE);
  const total = entries.reduce((sum, e) => sum + e.count, 0);

  // Ties share a rank (1, 2, 2, 4…)
  const ranks: number[] = [];
  entries.forEach((e, i) => ranks.push(i > 0 && e.count === entries[i - 1].count ? ranks[i - 1] : i + 1));

  return (
    <div className="flex flex-col overflow-hidden rounded-xl border border-white/[0.06] bg-surface-raised">
      <div className="border-b border-white/[0.06] bg-white/[0.04] px-4 py-3">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-bold uppercase tracking-wider text-zinc-200">
            <span className="mr-2">{board.icon}</span>
            {board.title}
          </h3>
          <span className={`text-xs font-bold ${board.color}`}>{total.toLocaleString()} total</span>
        </div>
        <p className="mt-0.5 text-[11px] text-zinc-500">{board.blurb}</p>
      </div>

      {entries.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-zinc-500">Nobody yet.</p>
      ) : (
        <div className="divide-y divide-white/[0.06]">
          {entries.slice(0, shown).map((e, i) => {
            const addr = normaliseStarknetAddress(e.address) ?? e.address;
            const name = usernames[addr.toLowerCase()];
            const r = ranks[i];
            return (
              <div
                key={e.address}
                className={`grid grid-cols-[44px_minmax(0,1fr)_auto] items-center gap-3 px-4 py-2 hover:bg-white/[0.04] ${
                  r <= 3 ? "bg-gradient-to-r from-lsGold/10 to-transparent" : ""
                }`}
              >
                <span
                  className={`text-sm font-black ${
                    r === 1 ? "text-yellow-300" : r === 2 ? "text-zinc-300" : r === 3 ? "text-orange-400" : "text-zinc-500"
                  }`}
                >
                  #{r}
                </span>
                <Link
                  to={`/collection/${encodeURIComponent(addr)}`}
                  className={`truncate transition-colors hover:text-gold ${name ? "text-zinc-200" : "font-mono text-zinc-300"}`}
                  title={addr}
                >
                  {name ?? `${addr.slice(0, 6)}…${addr.slice(-4)}`}
                </Link>
                <span className={`text-base font-black tabular-nums ${board.color}`}>{e.count.toLocaleString()}</span>
              </div>
            );
          })}
        </div>
      )}

      {entries.length > shown && (
        <button
          onClick={() => setShown((s) => s + PAGE_SIZE * 2)}
          className="mt-auto border-t border-white/[0.06] px-4 py-2 text-xs font-bold uppercase tracking-wider text-zinc-400 transition-colors hover:bg-white/[0.04] hover:text-white"
        >
          Show more ({entries.length - shown} more)
        </button>
      )}
    </div>
  );
}

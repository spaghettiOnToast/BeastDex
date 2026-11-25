import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { fetchLootLeaderboards, LOOT_BAG_URL } from "../../services/lootDungeon";
import { ABSTRACT_DUNGEON_URL, fetchAbstractLeaderboards } from "../../services/abstractDungeon";
import { useControllerUsernames } from "../../hooks/useControllerUsernames";
import { normaliseStarknetAddress } from "../../utils/address";

const PAGE_SIZE = 10;

type LeaderboardEntry = { address: string; count: number };
type BoardDef<K extends string> = { key: K; title: string; icon: string; unit: string; blurb: string; color: string };

const LOOT_BOARDS: BoardDef<"slain" | "staked" | "lost">[] = [
  { key: "slain", title: "Most Slain", icon: "⚔️", unit: "slain", blurb: "Loot beasts slain and claimed", color: "text-[#8bff72]" },
  { key: "staked", title: "Most Staked", icon: "🎒", unit: "staked", blurb: "Beasts staked for Mega, all time", color: "text-[#7dfbff]" },
  { key: "lost", title: "Most Lost", icon: "💀", unit: "lost", blurb: "Staked beasts taken by other players", color: "text-[#ff6b35]" },
];

const ABSTRACT_BOARDS: BoardDef<"slain" | "entered">[] = [
  { key: "slain", title: "Most Slain", icon: "⚔️", unit: "slain", blurb: "Abstract beasts slain and claimed", color: "text-[#8bff72]" },
  { key: "entered", title: "Most Games", icon: "🌀", unit: "games", blurb: "Free daily games entered", color: "text-[#c084fc]" },
];

export function LootBagLeaderboards() {
  return (
    <DungeonLeaderboards
      boards={LOOT_BOARDS}
      load={fetchLootLeaderboards}
      name="Loot Bag"
      loadingText="Reading the Loot Dungeon…"
      source={
        <>
          Read live from the{" "}
          <a href={LOOT_BAG_URL} target="_blank" rel="noreferrer" className="text-zinc-300 hover:text-gold">
            Loot Bag
          </a>{" "}
          (Loot Dungeon) contract events on chain.
        </>
      }
    />
  );
}

export function AbstractDungeonLeaderboards() {
  return (
    <DungeonLeaderboards
      boards={ABSTRACT_BOARDS}
      load={fetchAbstractLeaderboards}
      name="Abstract Dungeon"
      loadingText="Reading the Abstract Dungeon…"
      source={
        <>
          Read live from the{" "}
          <a href={ABSTRACT_DUNGEON_URL} target="_blank" rel="noreferrer" className="text-zinc-300 hover:text-gold">
            Abstract Dungeon
          </a>{" "}
          contract events on chain.
        </>
      }
    />
  );
}

/** A dungeon's leaderboards, one column per board, read from its contract events. */
function DungeonLeaderboards<K extends string>({
  boards,
  load,
  name,
  loadingText,
  source,
}: {
  boards: BoardDef<K>[];
  load: () => Promise<Record<K, LeaderboardEntry[]>>;
  name: string;
  loadingText: string;
  source: ReactNode;
}) {
  const [data, setData] = useState<Record<K, LeaderboardEntry[]> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    load()
      .then((d) => !cancelled && setData(d))
      .catch((err) => {
        console.error(`Failed to load ${name} leaderboards:`, err);
        if (!cancelled) setError(`Failed to load ${name} leaderboards`);
      });
    return () => {
      cancelled = true;
    };
  }, [nonce, load, name]);

  const addresses = useMemo(
    () => (data ? [...new Set(boards.flatMap((b) => data[b.key].map((e) => e.address)))] : []),
    [data, boards],
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
          <p className="text-zinc-400">{loadingText}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-zinc-500">{source}</p>
      <div className={`grid gap-4 ${boards.length === 2 ? "lg:grid-cols-2" : "lg:grid-cols-3"}`}>
        {boards.map((b) => (
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
  board: BoardDef<string>;
  entries: LeaderboardEntry[];
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
                <PlayerLink address={e.address} usernames={usernames} className="truncate" />
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

/** A player's username (else short address), linking to their collection. */
function PlayerLink({
  address,
  usernames,
  className = "",
}: {
  address: string;
  usernames: Record<string, string>;
  className?: string;
}) {
  const addr = normaliseStarknetAddress(address) ?? address;
  const name = usernames[addr.toLowerCase()];
  return (
    <Link
      to={`/collection/${encodeURIComponent(addr)}`}
      className={`transition-colors hover:text-gold ${name ? "text-zinc-200" : "font-mono text-zinc-300"} ${className}`}
      title={addr}
    >
      {name ?? `${addr.slice(0, 6)}…${addr.slice(-4)}`}
    </Link>
  );
}

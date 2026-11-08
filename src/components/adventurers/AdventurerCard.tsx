import type { ReactNode } from "react";
import { AlertTriangle, Clock, Coins, ExternalLink, Heart, Lock, Sparkles } from "lucide-react";
import { cn } from "../../lib/utils";
import {
  dungeonImageUrl,
  gameDungeonFor,
  gameStatus,
  lootSurvivorWatchUrl,
  type AdventurerGame,
  type GameStatus,
} from "../../services/adventurers";
import { decodeGameTokenId } from "../../services/adventurers/tokenId";
import { formatAgo, playedSinceListed } from "../../services/adventurers/format";

const STATUS_BADGE: Record<GameStatus, { label: string; className: string }> = {
  unplayed: { label: "Unplayed", className: "border-emerald-500/40 bg-emerald-900/60 text-emerald-300" },
  "in-progress": { label: "Game started", className: "border-amber-500/40 bg-amber-900/60 text-amber-300" },
  dead: { label: "Dead", className: "border-red-500/40 bg-red-950/70 text-red-300" },
  expired: { label: "Expired", className: "border-zinc-500/40 bg-zinc-900/80 text-zinc-400" },
  stuck: { label: "Stuck", className: "border-orange-500/40 bg-orange-950/70 text-orange-300" },
};

export function GameStatusBadge({ status }: { status: GameStatus }) {
  const b = STATUS_BADGE[status];
  return (
    <span className={cn("rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider", b.className)}>
      {b.label}
    </span>
  );
}

type Props = {
  tokenId: string;
  /** live state; null while loading / unknown to the API */
  game: AdventurerGame | null;
  /** unix seconds the listing was created (enables the "played since listed" flag) */
  listedAt?: number;
  selected?: boolean;
  onClick?: () => void;
  children?: ReactNode;
  className?: string;
};

export function AdventurerCard({ tokenId, game, listedAt, selected, onClick, children, className }: Props) {
  const decoded = game?.decoded ?? decodeGameTokenId(tokenId);
  const dungeon = gameDungeonFor(decoded?.minterId ?? 0);
  const status = game ? gameStatus(game) : null;
  const changed = playedSinceListed(game, listedAt);
  const shortId = `${BigInt(tokenId).toString(16).slice(-6)}`;

  return (
    <div
      className={cn(
        "group relative flex flex-col overflow-hidden rounded-xl border bg-surface/60 transition-all",
        selected ? "border-gold" : "border-white/[0.06] hover:border-white/20",
        onClick && "cursor-pointer",
        className,
      )}
      style={{ boxShadow: `inset 0 -2px 0 ${dungeon.accentColor}55` }}
      onClick={onClick}
    >
      <div className="relative aspect-[16/9] overflow-hidden bg-black">
        <img
          src={dungeonImageUrl(dungeon)}
          alt=""
          loading="lazy"
          className={cn("h-full w-full object-cover", (status === "dead" || status === "expired") && "grayscale opacity-50")}
        />
        <span
          className="absolute left-2 top-2 flex items-center gap-1 rounded-full bg-black/75 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white"
          title={`Minted by ${dungeon.name} (minter ${dungeon.minterId})`}
        >
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: dungeon.accentColor }} />
          {dungeon.name}
        </span>
        <div className="absolute right-2 top-2 flex flex-col items-end gap-1">
          {status && <GameStatusBadge status={status} />}
          {decoded?.soulbound && (
            <span className="flex items-center gap-1 rounded-full border border-zinc-500/40 bg-black/75 px-2 py-0.5 text-[10px] font-bold uppercase text-zinc-300">
              <Lock className="h-3 w-3" /> Soulbound
            </span>
          )}
        </div>
        <div className="absolute inset-x-0 bottom-0 flex items-end justify-between bg-gradient-to-t from-black/90 to-transparent px-2 pb-1.5 pt-6">
          <span className="text-lg font-bold leading-none text-white">
            {game ? `Lv ${game.level}` : "—"}
            {game && game.xp > 0 && <span className="ml-1 text-[10px] font-normal text-zinc-400">{game.xp} XP</span>}
          </span>
          <span className="font-mono text-[10px] text-zinc-500">#{shortId}</span>
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-1.5 p-2.5">
        {game ? (
          <>
            <div className="grid grid-cols-2 gap-1.5 text-[11px]">
              <span className="flex items-center gap-1 text-zinc-300">
                <Heart className="h-3 w-3 text-red-400" /> {game.health} HP
              </span>
              <span className="flex items-center gap-1 text-zinc-300">
                <Coins className="h-3 w-3 text-yellow-400" /> {game.gold} gold
              </span>
            </div>
            <div className="flex items-center gap-1 text-[10px] text-zinc-500">
              {game.started ? (
                <>
                  <Clock className="h-3 w-3" />
                  {game.lastActionAt
                    ? `Last action ${formatAgo(game.lastActionAt)}`
                    : `${game.actionCount} action${game.actionCount === 1 ? "" : "s"}`}
                </>
              ) : (
                <>
                  <Sparkles className="h-3 w-3 text-emerald-400" /> Fresh ticket · minted {formatAgo(game.decoded.mintedAt)}
                </>
              )}
            </div>
            {game.expiresAt !== null && status !== "expired" && (
              <div className="text-[10px] text-zinc-500">Expires {new Date(game.expiresAt * 1000).toLocaleString()}</div>
            )}
            {changed && (
              <div className="flex items-center gap-1 rounded border border-amber-500/30 bg-amber-500/10 px-1.5 py-1 text-[10px] text-amber-200">
                <AlertTriangle className="h-3 w-3 flex-shrink-0" /> Played since it was listed
              </div>
            )}
          </>
        ) : (
          <div className="text-[11px] text-zinc-500">Loading game state…</div>
        )}
        <a
          href={lootSurvivorWatchUrl(tokenId, dungeon.minterId)}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="flex items-center gap-1 text-[10px] text-zinc-500 hover:text-zinc-300"
        >
          View on Loot Survivor <ExternalLink className="h-3 w-3" />
        </a>
        {children && <div className="mt-auto pt-1">{children}</div>}
      </div>
    </div>
  );
}

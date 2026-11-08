import { useState, type CSSProperties, type ReactNode } from "react";
import { AlertTriangle, Clock, Coins, ExternalLink, Heart, Shield, Sparkles } from "lucide-react";
import { cn } from "../../lib/utils";
import {
  dungeonImageUrl,
  gameDungeonFor,
  gameStatus,
  lootSurvivorWatchUrl,
  playedSince,
  secondsUntilIdle,
  type AdventurerGame,
  type GameStatus,
} from "../../services/adventurers";
import { decodeGameTokenId } from "../../services/adventurers/tokenId";
import { formatAgo } from "../../services/adventurers/format";
import { useGameDetail } from "../../hooks/useAdventurerGames";
import { GearPanel } from "./GearPanel";

/** Plate colours, in the style of the beast card's grade badge. */
const STATUS_PLATE: Record<GameStatus, { label: string; title: string; bg: string; fg: string; border: string }> = {
  unplayed: { label: "UNPLAYED", title: "Fresh ticket: not started yet", bg: "#c4a44a", fg: "#000", border: "#f3dc8a" },
  "in-progress": { label: "LIVE", title: "Game started: the adventurer is alive", bg: "#15803d", fg: "#fff", border: "#86efac" },
  dead: { label: "DEAD", title: "The adventurer died", bg: "#dc2626", fg: "#fff", border: "#fca5a5" },
  expired: { label: "EXPIRED", title: "The game's play window has ended", bg: "#3f3f46", fg: "#d4d4d8", border: "#71717a" },
  stuck: { label: "STUCK", title: "An action was never revealed", bg: "#c2410c", fg: "#fff", border: "#fdba74" },
};

const plateStyle = (bg: string, fg: string, border: string): CSSProperties => ({
  background: bg,
  color: fg,
  border: `1px solid ${border}`,
  borderRadius: 4,
  boxShadow: "0 1px 4px rgba(0,0,0,0.6)",
  fontWeight: "bold",
  letterSpacing: 0.5,
  lineHeight: 1,
});

function Plate({ children, title, style }: { children: ReactNode; title: string; style: CSSProperties }) {
  return (
    <span title={title} style={style} className="px-[5px] py-[3px] text-[9px]">
      {children}
    </span>
  );
}

/** Grade-style status plate (also used in lists and dialogs). */
export function GameStatusBadge({ status }: { status: GameStatus }) {
  const p = STATUS_PLATE[status];
  return (
    <Plate title={p.title} style={plateStyle(p.bg, p.fg, p.border)}>
      {p.label}
    </Plate>
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
  const changed = playedSince(game, listedAt);
  const coolingFor = game && status === "in-progress" ? secondsUntilIdle(game) : 0;
  const inBattle = !!game && status === "in-progress" && game.beastHealth > 0;
  const shortId = BigInt(tokenId).toString(16).slice(-6);

  // Gear: shown while hovering the art/stats (desktop) or pinned with the Gear chip (touch)
  const [hovering, setHovering] = useState(false);
  const [pinned, setPinned] = useState(false);
  const showGear = hovering || pinned;
  const detail = useGameDetail(tokenId, showGear && !game?.gear);
  const gear = game?.gear ?? detail.data?.gear;

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
      {/* Art + stats: hovering here swaps in the gear panel (the action buttons below stay clickable) */}
      <div className="relative" onMouseEnter={() => setHovering(true)} onMouseLeave={() => setHovering(false)}>
      {showGear && (
        <div className="absolute inset-0 z-30 bg-[#0b0b0f]/95 backdrop-blur-sm">
          <GearPanel gear={gear} loading={detail.isFetching} />
        </div>
      )}
      <div className="relative aspect-[16/9] overflow-hidden bg-black">
        <img
          src={dungeonImageUrl(dungeon)}
          alt=""
          loading="lazy"
          className={cn("h-full w-full object-cover", (status === "dead" || status === "expired") && "grayscale opacity-50")}
        />
        {/* Status plates, top-left like the beast grade badge */}
        <div className="absolute left-[5px] top-[5px] z-10 flex flex-wrap gap-1">
          {status && <GameStatusBadge status={status} />}
          {decoded?.soulbound && (
            <Plate title="Soulbound: can't be sold or sent" style={plateStyle("#0b0b0d", "#fff", "rgba(255,255,255,0.25)")}>
              SOULBOUND
            </Plate>
          )}
          {inBattle && (
            <Plate title={`In a fight (beast has ${game!.beastHealth} HP)`} style={plateStyle("#6d28d9", "#fff", "#c4b5fd")}>
              IN BATTLE
            </Plate>
          )}
          {coolingFor !== null && coolingFor > 0 && (
            <Plate
              title="Played under 5 minutes ago: can be sold once its last move is revealed"
              style={plateStyle("#0b0b0d", "#fcd34d", "#fcd34d88")}
            >
              COOLDOWN {Math.ceil(coolingFor / 60)}M
            </Plate>
          )}
        </div>
        <span
          className="absolute right-[5px] top-[5px] flex items-center gap-1 rounded-full bg-black/75 px-2 py-0.5 text-[10px] font-bold text-white"
          title={`Minted by ${dungeon.name} (minter ${dungeon.minterId})`}
        >
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: dungeon.accentColor }} />
          {dungeon.name}
        </span>
        <div className="absolute inset-x-0 bottom-0 flex items-end justify-between bg-gradient-to-t from-black/90 to-transparent px-2 pb-1.5 pt-6">
          <span className="text-lg font-bold leading-none text-white">
            {game ? `Lv ${game.level}` : "—"}
            {game && game.xp > 0 && <span className="ml-1 text-[10px] font-normal text-zinc-400">{game.xp} XP</span>}
          </span>
          <span className="flex items-center gap-1.5">
            <button
              type="button"
              className={cn(
                "relative z-40 flex items-center gap-0.5 rounded bg-black/70 px-1.5 py-0.5 text-[9px] font-bold uppercase text-zinc-300 hover:text-white",
                pinned && "text-gold",
              )}
              title="Show gear"
              onClick={(e) => {
                e.stopPropagation();
                setPinned((p) => !p);
              }}
            >
              <Shield className="h-3 w-3" /> Gear
            </button>
            <span className="font-mono text-[10px] text-zinc-500">#{shortId}</span>
          </span>
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
                  Game started ·{" "}
                  {game.lastActionAt
                    ? `last action ${formatAgo(game.lastActionAt)}`
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
      </div>
      </div>
      {children && <div className="mt-auto px-2.5 pb-2.5">{children}</div>}
    </div>
  );
}

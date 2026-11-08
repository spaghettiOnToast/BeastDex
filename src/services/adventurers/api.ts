/**
 * Loot Survivor games API (api-v2-next): a wallet's games per dungeon and
 * single-game state. Immutable fields come from the token id itself.
 */
import { GAMES_API_URL, GAME_CORE_ADDRESS, GAME_DUNGEONS } from "./constants";
import { decodeGameTokenId, gameExpiresAt, type DecodedGameToken } from "./tokenId";

/** One game as returned by `GET /games?owner=…` */
type ApiGameRow = {
  tokenId: string;
  score?: number;
  gameOver?: boolean;
  minterId?: number;
  settingsId?: number;
  health?: number;
  gold?: number;
  beastHealth?: number;
  actionCount?: number;
  lastActionAt?: string | null;
  lastActionBlock?: number | null;
  settled?: boolean;
  started?: boolean;
  stuck?: boolean;
};

/** `GET /games/:id` */
type ApiGameDetail = {
  tokenId: string;
  minterId?: number;
  owner?: string;
  adventurer?: { xp?: number; gold?: number; health?: number; beast_health?: number } | null;
  actionCount?: number;
  started?: boolean;
  gameOver?: boolean;
  settled?: boolean;
  stuck?: boolean;
  lastActionBlock?: number | null;
};

export type GameStatus = "unplayed" | "in-progress" | "dead" | "expired" | "stuck";

export type AdventurerGame = {
  /** canonical decimal token id */
  tokenId: string;
  decoded: DecodedGameToken;
  minterId: number;
  settingsId: number;
  xp: number;
  level: number;
  health: number;
  gold: number;
  beastHealth: number;
  actionCount: number;
  started: boolean;
  gameOver: boolean;
  stuck: boolean;
  /** unix seconds of the last action, when the API reports it */
  lastActionAt: number | null;
  lastActionBlock: number | null;
  /** unix seconds, null = never expires */
  expiresAt: number | null;
  owner?: string;
};

/** Loot Survivor level from XP (level 1 until 4 XP, then floor(sqrt(xp))). */
export function levelFromXp(xp: number): number {
  return xp <= 0 ? 1 : Math.max(1, Math.floor(Math.sqrt(xp)));
}

export function gameStatus(game: Pick<AdventurerGame, "started" | "gameOver" | "stuck" | "expiresAt">, nowSec = Date.now() / 1000): GameStatus {
  if (game.gameOver) return "dead";
  if (game.stuck) return "stuck";
  if (game.expiresAt !== null && game.expiresAt <= nowSec) return "expired";
  return game.started ? "in-progress" : "unplayed";
}

/** Whether a game can be sold or sent: alive, playable and not soulbound. */
export function gameTradeBlocker(game: AdventurerGame): string | null {
  if (game.decoded.soulbound) return "Soulbound games can't be transferred.";
  switch (gameStatus(game)) {
    case "dead":
      return "This adventurer is dead.";
    case "expired":
      return "This game has expired.";
    case "stuck":
      return "This game is stuck mid-action on Loot Survivor.";
    default:
      return null;
  }
}

const toDecimal = (id: string): string | null => {
  try {
    return BigInt(id).toString();
  } catch {
    return null;
  }
};

const parseTime = (iso: string | null | undefined): number | null => {
  if (!iso) return null;
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? null : Math.floor(ms / 1000);
};

function buildGame(
  tokenIdRaw: string,
  fields: Omit<AdventurerGame, "tokenId" | "decoded" | "minterId" | "settingsId" | "level" | "expiresAt"> & {
    minterId?: number;
    settingsId?: number;
  },
): AdventurerGame | null {
  const tokenId = toDecimal(tokenIdRaw);
  const decoded = tokenId ? decodeGameTokenId(tokenId) : null;
  if (!tokenId || !decoded) return null;
  return {
    ...fields,
    tokenId,
    decoded,
    minterId: decoded.minterId,
    settingsId: decoded.settingsId,
    level: levelFromXp(fields.xp),
    expiresAt: gameExpiresAt(decoded),
  };
}

export function gameFromRow(row: ApiGameRow, owner?: string): AdventurerGame | null {
  return buildGame(row.tokenId, {
    xp: row.score ?? 0,
    health: row.health ?? 0,
    gold: row.gold ?? 0,
    beastHealth: row.beastHealth ?? 0,
    actionCount: row.actionCount ?? 0,
    started: !!row.started,
    gameOver: !!row.gameOver,
    stuck: !!row.stuck,
    lastActionAt: parseTime(row.lastActionAt),
    lastActionBlock: row.lastActionBlock ?? null,
    owner,
  });
}

export function gameFromDetail(detail: ApiGameDetail): AdventurerGame | null {
  return buildGame(detail.tokenId, {
    xp: detail.adventurer?.xp ?? 0,
    health: detail.adventurer?.health ?? 0,
    gold: detail.adventurer?.gold ?? 0,
    beastHealth: detail.adventurer?.beast_health ?? 0,
    actionCount: detail.actionCount ?? 0,
    started: !!detail.started,
    gameOver: !!detail.gameOver,
    stuck: !!detail.stuck,
    lastActionAt: null,
    lastActionBlock: detail.lastActionBlock ?? null,
    owner: detail.owner,
  });
}

async function getJson<T>(path: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(`${GAMES_API_URL}${path}`, { signal });
  if (!res.ok) throw new Error(`games API ${res.status} for ${path.split("?")[0]}`);
  return res.json() as Promise<T>;
}

const PAGE = 100;
const MAX_PAGES = 50;

/** All of `owner`'s games minted by one dungeon. */
export async function fetchOwnerGamesForMinter(
  owner: string,
  minterId: number,
  { gameOver, signal }: { gameOver?: boolean; signal?: AbortSignal } = {},
): Promise<AdventurerGame[]> {
  const games: AdventurerGame[] = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    const q = new URLSearchParams({
      owner,
      game_core: GAME_CORE_ADDRESS,
      minter_id: String(minterId),
      limit: String(PAGE),
      offset: String(page * PAGE),
    });
    if (gameOver !== undefined) q.set("game_over", String(gameOver));
    const res = await getJson<{ data?: ApiGameRow[]; total?: number }>(`/games?${q}`, signal);
    const rows = res.data ?? [];
    for (const row of rows) {
      const g = gameFromRow(row, owner);
      if (g) games.push(g);
    }
    if (rows.length < PAGE || games.length >= (res.total ?? 0)) break;
  }
  return games;
}

/** All of `owner`'s games across every known dungeon, newest first. */
export async function fetchOwnerGames(
  owner: string,
  opts: { gameOver?: boolean; signal?: AbortSignal } = {},
): Promise<AdventurerGame[]> {
  const perMinter = await Promise.all(
    GAME_DUNGEONS.map((d) =>
      fetchOwnerGamesForMinter(owner, d.minterId, opts).catch((err) => {
        console.warn(`[adventurers] games for minter ${d.minterId} failed:`, err);
        return [] as AdventurerGame[];
      }),
    ),
  );
  return perMinter.flat().sort((a, b) => b.decoded.mintedAt - a.decoded.mintedAt);
}

/** Current state of one game (owner included), or null if the API doesn't know it. */
export async function fetchGame(tokenId: string, signal?: AbortSignal): Promise<AdventurerGame | null> {
  const hex = `0x${BigInt(tokenId).toString(16).padStart(64, "0")}`;
  try {
    return gameFromDetail(await getJson<ApiGameDetail>(`/games/${hex}`, signal));
  } catch (err) {
    if (err instanceof Error && err.message.includes(" 404 ")) return null;
    throw err;
  }
}

/**
 * Hydrate marketplace listings: games grouped by seller + dungeon (one paged
 * call each, which also carries the last-action time), with a per-token
 * fallback for anything not found that way (e.g. dead or moved games).
 */
export async function fetchGamesForListings(
  items: Array<{ tokenId: string; seller: string }>,
  signal?: AbortSignal,
): Promise<Map<string, AdventurerGame>> {
  const out = new Map<string, AdventurerGame>();
  const groups = new Map<string, { seller: string; minterId: number }>();
  for (const { tokenId, seller } of items) {
    const decoded = decodeGameTokenId(tokenId);
    if (!decoded) continue;
    const key = `${BigInt(seller).toString(16)}:${decoded.minterId}`;
    if (!groups.has(key)) groups.set(key, { seller, minterId: decoded.minterId });
  }
  await Promise.all(
    [...groups.values()].map(async ({ seller, minterId }) => {
      try {
        for (const g of await fetchOwnerGamesForMinter(seller, minterId, { gameOver: false, signal })) out.set(g.tokenId, g);
      } catch (err) {
        console.warn("[adventurers] listing hydration failed:", err);
      }
    }),
  );
  const missing = items.map((i) => toDecimal(i.tokenId)).filter((id): id is string => !!id && !out.has(id));
  for (let i = 0; i < missing.length; i += 6) {
    await Promise.all(
      missing.slice(i, i + 6).map(async (id) => {
        const g = await fetchGame(id, signal).catch(() => null);
        if (g) out.set(id, g);
      }),
    );
  }
  return out;
}

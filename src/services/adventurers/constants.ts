/**
 * Loot Survivor games ("adventurers") as tradable NFTs.
 *
 * Every live lootsurvivor.io game is an ERC721 on the v2 game core
 * ("Super Death Mountain", SDM). The dungeon that minted a game (Beast Mode,
 * Karats, a Budokan tournament…) is packed into the token id as `minted_by`
 * (a minter id), so the ticket type is known without any lookup.
 *
 * Addresses and minter ids were read from the lootsurvivor.io client
 * (dungeon configs) and checked against the chain / games API on 2026-11-08.
 */
import { DUNGEONS, LOOT_SURVIVOR_URL, type Dungeon } from "../lootSurvivor";

/** v2 game core: the ERC721 every game token lives on. */
export const GAME_CORE_ADDRESS =
  (import.meta.env.VITE_GAME_CORE_ADDRESS as string | undefined) ||
  "0x03cafe867e9f5dc7ccf73471b98c1d6d6d54804744cef9626accd217b6ad1dd2";

/** Loot Survivor's games indexer (CORS-open). */
export const GAMES_API_URL = (
  (import.meta.env.VITE_GAMES_API_URL as string | undefined) || "https://api-v2-next.up.railway.app"
).replace(/\/+$/, "");

/** Kill switch for the Adventurers market / My Games. On by default. */
export const ADVENTURER_MARKET_ENABLED =
  (import.meta.env.VITE_ADVENTURER_MARKET_ENABLED as string | undefined)?.trim().toLowerCase() !== "false";

/**
 * ERC-2981 royalty the game core charges on every sale: 2000 bps (20%) to
 * 0x041bb7729efa185f2cab327de0a668886302f1d4969e3edf504c4741648f858b
 * (`default_royalty`, checked 2026-11-08). Arcade deducts it from the seller.
 */
export const ADVENTURER_ROYALTY_BP = 2000;
/** BeastDex client fee on game purchases (paid by the buyer); Beasts stay at 5%. */
export const ADVENTURER_CLIENT_FEE_BP = 250;

export const ADVENTURER_ROYALTY_RECEIVER = "0x041bb7729efa185f2cab327de0a668886302f1d4969e3edf504c4741648f858b";

/** A ticket type: the dungeon behind a minter id. */
export type GameDungeon = {
  minterId: number;
  /** lootsurvivor.io dungeon id (used in `/play?dungeon=`) */
  dungeonId: string;
  name: string;
  accentColor: string;
  /** card art path on lootsurvivor.io */
  image: string;
};

const dungeonInfo = (id: string): Pick<Dungeon, "name" | "accentColor" | "image"> | undefined => {
  const d = DUNGEONS.find((x) => x.id === id);
  return d && { name: d.name, accentColor: d.accentColor, image: d.image };
};

const dungeon = (minterId: number, dungeonId: string, fallback: Omit<GameDungeon, "minterId" | "dungeonId">): GameDungeon => ({
  minterId,
  dungeonId,
  ...fallback,
  ...dungeonInfo(dungeonId),
});

/** Known minters on the game core. Tournaments and PvP both enter through Budokan. */
export const GAME_DUNGEONS: GameDungeon[] = [
  dungeon(1, "beastmode", { name: "Beast Mode", accentColor: "#4caf50", image: "/images/dungeons/beast_mode.png" }),
  dungeon(2, "greed", { name: "Greed Run", accentColor: "#21f3d0", image: "/images/dungeons/hyper_greed.png" }),
  dungeon(3, "karats", { name: "Karats", accentColor: "#26c6da", image: "/images/dungeons/karat.png" }),
  // Budokan: a tournament or PvP entry. The entry is tied to the token, so it moves with it.
  { ...dungeon(4, "tournaments", { name: "", accentColor: "#e65100", image: "/images/dungeons/tournaments.png" }), name: "Tournament / PvP" },
  dungeon(13, "lootbag", { name: "Loot Bag", accentColor: "#d4a017", image: "/images/dungeons/lootbag.png" }),
];

export function gameDungeonFor(minterId: number): GameDungeon {
  return (
    GAME_DUNGEONS.find((d) => d.minterId === minterId) ?? {
      minterId,
      dungeonId: "beastmode",
      name: `Dungeon #${minterId}`,
      accentColor: "#71717a",
      image: "/images/dungeons/beast_mode.png",
    }
  );
}

/** Play / resume a game on lootsurvivor.io. */
export function lootSurvivorPlayUrl(tokenId: string, minterId: number): string {
  const { dungeonId } = gameDungeonFor(minterId);
  return `${LOOT_SURVIVOR_URL}/play?id=${BigInt(tokenId).toString()}&dungeon=${encodeURIComponent(dungeonId)}`;
}

/** Watch a game on lootsurvivor.io (works for anyone's game). */
export function lootSurvivorWatchUrl(tokenId: string, minterId: number): string {
  const { dungeonId } = gameDungeonFor(minterId);
  return `${LOOT_SURVIVOR_URL}/watch?id=${BigInt(tokenId).toString()}&dungeon=${encodeURIComponent(dungeonId)}`;
}

export const dungeonImageUrl = (d: GameDungeon) => `${LOOT_SURVIVOR_URL}${d.image}`;

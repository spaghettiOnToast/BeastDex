/**
 * Abstract Dungeon (lootsurvivor.io/abstract): the registry minter for the
 * Abstract beasts (species 108-122). Abstract wallet holders claim free daily
 * games; slain beasts are minted straight to the player.
 *
 * Unlike the Loot Dungeon there is no staking, Mega transform or taking, so
 * the dungeon never holds or burns a player's beast. Everything here comes
 * from its on-chain events (no indexer):
 * - `BeastClaimed` keys [selector, adventurer_id, token_id.low, token_id.high];
 *   data [encounter_xp, collection_id, beast_id, prefix, suffix, health, level, recipient]
 * - `DungeonEntered` keys [selector, recipient, eth_address];
 *   data [tier, settings_id, adventurer_id, day, used_today]
 */
import { hash } from "starknet";
import type { BeastSpecies } from "@provable-games/collectables";
import { isAbstractSpecies } from "../utils/speciesSet";
import { withReadProvider } from "./tx";

/** Abstract Dungeon game: mints species 108-122. */
export const ABSTRACT_DUNGEON_ADDRESS =
  "0x0181517a272aa72cb61f65997435b3a31083f378783fa3e3a04b6dbd741b5f50";

export const ABSTRACT_DUNGEON_URL = "https://www.lootsurvivor.io/abstract";

/** Before the Abstract Dungeon's first event (18,512,193). */
const ABSTRACT_DUNGEON_START_BLOCK = 18_512_000;

const SCAN_TTL_MS = 60_000;

export function isAbstractDungeon(address: string | null | undefined): boolean {
  try {
    return !!address && BigInt(address) === BigInt(ABSTRACT_DUNGEON_ADDRESS);
  } catch {
    return false;
  }
}

/** The Abstract species in the catalog. */
export function abstractSpecies(species: readonly BeastSpecies[]): BeastSpecies[] {
  return species.filter((s) => isAbstractSpecies(s.speciesId));
}

type DungeonEvent = { keys: string[]; data: string[] };

const hex = (v: string | undefined) => `0x${BigInt(v ?? "0x0").toString(16)}`;

/** `BeastClaimed` → who slew (and now holds) the beast. */
export function parseAbstractClaim(e: DungeonEvent): { recipient: string; speciesId: number } {
  return { recipient: hex(e.data[7]), speciesId: Number(BigInt(e.data[2] ?? "0x0")) };
}

/** `DungeonEntered` → the player who entered with one of their daily games. */
export function parseAbstractEntry(e: DungeonEvent): { player: string } {
  return { player: hex(e.keys[1]) };
}

export type AbstractLog = { claims: Array<{ recipient: string; speciesId: number }>; entries: Array<{ player: string }> };

const CLAIMED = hash.getSelectorFromName("BeastClaimed");
const ENTERED = hash.getSelectorFromName("DungeonEntered");

let log: AbstractLog & { nextBlock: number; at: number } = {
  claims: [],
  entries: [],
  nextBlock: ABSTRACT_DUNGEON_START_BLOCK,
  at: 0,
};
let scan: Promise<AbstractLog> | null = null;

/** Every claim and daily entry so far, scanned incrementally from the chain. */
export async function scanAbstractDungeon(): Promise<AbstractLog> {
  if (Date.now() - log.at < SCAN_TTL_MS) return log;
  if (scan) return scan;
  scan = withReadProvider(async (p) => {
    const head = await p.getBlockNumber();
    const claimedKey = BigInt(CLAIMED);
    const enteredKey = BigInt(ENTERED);
    const claims: AbstractLog["claims"] = [];
    const entries: AbstractLog["entries"] = [];
    let token: string | undefined;
    for (let page = 0; page < 500; page++) {
      const res = await p.getEvents({
        address: ABSTRACT_DUNGEON_ADDRESS,
        keys: [[CLAIMED, ENTERED]],
        from_block: { block_number: log.nextBlock },
        to_block: { block_number: head },
        chunk_size: 1000,
        continuation_token: token,
      });
      for (const e of res.events) {
        const key = BigInt(e.keys[0]);
        if (key === claimedKey) claims.push(parseAbstractClaim(e));
        else if (key === enteredKey) entries.push(parseAbstractEntry(e));
      }
      token = res.continuation_token;
      if (!token) break;
    }
    log = {
      claims: [...log.claims, ...claims],
      entries: [...log.entries, ...entries],
      nextBlock: head + 1,
      at: Date.now(),
    };
    return log;
  }).finally(() => {
    scan = null;
  });
  return scan;
}

export type DungeonLeaderboardEntry = { address: string; count: number };
export type AbstractLeaderboards = {
  /** Abstract beasts slain (claimed) per player */
  slain: DungeonLeaderboardEntry[];
  /** daily games entered per player */
  entered: DungeonLeaderboardEntry[];
};

function rank(addresses: string[]): DungeonLeaderboardEntry[] {
  const counts = new Map<string, number>();
  for (const a of addresses) {
    const k = hex(a);
    if (k === "0x0") continue;
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  return [...counts]
    .map(([address, count]) => ({ address, count }))
    .sort((a, b) => b.count - a.count || a.address.localeCompare(b.address));
}

/** Pure aggregation of the dungeon's event log into its leaderboards. */
export function buildAbstractLeaderboards(l: AbstractLog): AbstractLeaderboards {
  return {
    slain: rank(l.claims.map((c) => c.recipient)),
    entered: rank(l.entries.map((e) => e.player)),
  };
}

/** Abstract Dungeon leaderboards: most beasts slain, most daily games entered. */
export async function fetchAbstractLeaderboards(): Promise<AbstractLeaderboards> {
  return buildAbstractLeaderboards(await scanAbstractDungeon());
}

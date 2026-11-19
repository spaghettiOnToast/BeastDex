/**
 * Loot Dungeon (lootsurvivor.io/lootbag) Mega staking.
 *
 * Staking a Loot beast for its Mega transform moves the NFT into the Loot
 * Dungeon contract (the species' registry minter) until it's withdrawn, so the
 * owner's wallet — and every owner-scoped API query — no longer shows it. The
 * contract keeps who staked it: `beast_stake(token_id) -> BeastStake`.
 *
 * Read entirely on chain (no indexer): the Loot species' token ids via the
 * Beasts NFT's `get_species_token_ids`, then `beast_stake` for each, as
 * JSON-RPC batches (the public RPC caps a batch at 100 calls).
 */
import { hash } from "starknet";
import {
  beastFromV3Token,
  beastsV3,
  type BeastSpecies,
} from "@provable-games/collectables";
import { BEASTS_V3_ADDRESS } from "./beast/constants";
import { fetchBeastSpecies } from "./beast/species";
import { mapSdkBeast } from "./beast/helpers";
import { fetchBeastsByIds, type Beast } from "./beast";
import { readRpcUrls, withReadProvider } from "./tx";

/** Loot Dungeon game: mints species 78-107 and escrows beasts staked for Mega. */
export const LOOT_DUNGEON_ADDRESS =
  "0x03921001b64ad6af2bae27b95c27c465fc8921d9c537f4821eb3023b5889622f";

export const LOOT_BAG_URL = "https://www.lootsurvivor.io/lootbag";

/** Before the Loot Dungeon's first claim/stake (claims start at 18,113,224). */
const LOOT_DUNGEON_START_BLOCK = 18_113_000;

const RPC_BATCH_MAX = 100;
const TOKEN_IDS_TTL_MS = 60_000;

export type LootStake = {
  tokenId: string;
  staker: string;
  /** unix seconds */
  stakedAt: number;
  /** unix seconds; the Mega transform is ready from then */
  transformsAt: number;
  unsafeStake: boolean;
};

export type StakedLootBeast = LootStake & { beast: Beast };

/**
 * A beast taken from a player by someone else's Loot Dungeon claim
 * (`BeastClaimed` with a non-zero `taken_from`). The claim burns the taken
 * token (clearing any Mega stake, however close it was) and mints the killer a
 * new token of the same beast, unstaked.
 */
export type TakenLootBeast = {
  /** the burned token */
  tokenId: string;
  /** the killer's new token of the same beast */
  newTokenId: string;
  takenFrom: string;
  /** the claim's recipient, who holds the new token */
  takenBy: string;
  adventurerId: string;
  block: number;
  txHash: string;
  beast: Beast;
};

type RpcCall = { contract: string; entrypoint: string; calldata: string[] };

const selectors = new Map<string, string>();
function selector(entrypoint: string): string {
  let s = selectors.get(entrypoint);
  if (!s) {
    s = hash.getSelectorFromName(entrypoint);
    selectors.set(entrypoint, s);
  }
  return s;
}

async function postBatch(rpcUrl: string, calls: RpcCall[]): Promise<string[][]> {
  const body = calls.map((c, id) => ({
    jsonrpc: "2.0",
    id,
    method: "starknet_call",
    params: {
      request: { contract_address: c.contract, entry_point_selector: selector(c.entrypoint), calldata: c.calldata },
      block_id: "latest",
    },
  }));
  const res = await fetch(rpcUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`RPC batch: HTTP ${res.status}`);
  const json: unknown = await res.json();
  if (!Array.isArray(json)) throw new Error("RPC batch: not a batch response");
  const out: string[][] = new Array(calls.length);
  for (const r of json as Array<{ id: number; result?: string[]; error?: { message?: string } }>) {
    if (r.error || !r.result) throw new Error(`RPC batch: ${r.error?.message ?? "no result"}`);
    out[r.id] = r.result;
  }
  return out;
}

/** starknet_call for many calls: chunks of 100, each tried on the read RPCs in turn. */
export async function batchCall(calls: RpcCall[]): Promise<string[][]> {
  const chunks: RpcCall[][] = [];
  for (let i = 0; i < calls.length; i += RPC_BATCH_MAX) chunks.push(calls.slice(i, i + RPC_BATCH_MAX));
  const results = await Promise.all(
    chunks.map(async (chunk) => {
      let lastErr: unknown;
      for (const url of readRpcUrls()) {
        try {
          return await postBatch(url, chunk);
        } catch (err) {
          lastErr = err;
        }
      }
      throw lastErr;
    }),
  );
  return results.flat();
}

function u256Calldata(tokenId: string): [string, string] {
  const b = BigInt(tokenId);
  return [`0x${(b & ((1n << 128n) - 1n)).toString(16)}`, `0x${(b >> 128n).toString(16)}`];
}

/** Species served by the Loot renderer (the registry's, else the mainnet range). */
export function lootSpecies(species: readonly BeastSpecies[]): BeastSpecies[] {
  return species.filter((s) =>
    s.renderer ? beastsV3.isLootRenderer(s.renderer) : beastsV3.isLootSpecies(s.speciesId),
  );
}

let tokenIdsCache: { at: number; ids: Promise<string[]> } | null = null;

/** Every minted Loot Dungeon token id (decimal), cached briefly. */
async function lootTokenIds(species: readonly BeastSpecies[]): Promise<string[]> {
  if (tokenIdsCache && Date.now() - tokenIdsCache.at < TOKEN_IDS_TTL_MS) return tokenIdsCache.ids;
  const ids = (async () => {
    const loot = lootSpecies(species);
    const res = await batchCall(
      loot.map((s) => ({
        contract: BEASTS_V3_ADDRESS,
        entrypoint: "get_species_token_ids",
        calldata: [`0x${s.speciesId.toString(16)}`],
      })),
    );
    // Each result is [len, id0, id1, ...] (v3 token ids are 251-bit felts).
    return res.flatMap((r) => r.slice(1).map((id) => BigInt(id).toString()));
  })();
  tokenIdsCache = { at: Date.now(), ids };
  ids.catch(() => {
    if (tokenIdsCache?.ids === ids) tokenIdsCache = null;
  });
  return ids;
}

function parseStake(tokenId: string, r: string[]): LootStake | null {
  const [staker, stakedAt, transformsAt, unsafe] = r.map((x) => BigInt(x));
  if (!staker) return null;
  return {
    tokenId,
    staker: `0x${staker.toString(16)}`,
    stakedAt: Number(stakedAt),
    transformsAt: Number(transformsAt),
    unsafeStake: unsafe === 1n,
  };
}

export function isLootDungeon(address: string | null | undefined): boolean {
  try {
    return !!address && BigInt(address) === BigInt(LOOT_DUNGEON_ADDRESS);
  } catch {
    return false;
  }
}

/** One beast's Loot Bag stake (who staked it, when the Mega is ready), or null if not staked. */
export async function fetchLootStake(tokenId: string): Promise<LootStake | null> {
  const [r] = await batchCall([{ contract: LOOT_DUNGEON_ADDRESS, entrypoint: "beast_stake", calldata: u256Calldata(tokenId) }]);
  return parseStake(tokenId, r);
}

/** Loot beasts `owner` has staked in the Loot Dungeon (transforming or ready). */
export async function fetchLootStakes(owner: string): Promise<LootStake[]> {
  const me = BigInt(owner);
  const species = await fetchBeastSpecies();
  const ids = await lootTokenIds(species);
  if (ids.length === 0) return [];
  const stakes = await batchCall(
    ids.map((id) => ({ contract: LOOT_DUNGEON_ADDRESS, entrypoint: "beast_stake", calldata: u256Calldata(id) })),
  );
  const out: LootStake[] = [];
  stakes.forEach((r, i) => {
    const stake = parseStake(ids[i], r);
    if (stake && BigInt(stake.staker) === me) out.push(stake);
  });
  return out.sort((a, b) => a.transformsAt - b.transformsAt);
}

/** Display data decoded from a v3 token id (no indexer needed). */
function beastFromToken(tokenId: string, names: Map<number, string>, owner: string): Beast {
  return mapSdkBeast(
    beastFromV3Token({
      tokenId,
      speciesName: names.get(Number(beastsV3.speciesOfTokenId(BigInt(tokenId)))) ?? null,
      rank: 0,
      adventurersKilled: 0,
      owner,
    }),
  );
}

/**
 * Staked Loot beasts the owner still has in the Loot Bag. Indexed data (with
 * the species rank) when the API has the beast, else decoded from the token id.
 */
export function fetchStakedLootBeasts(owner: string): Promise<StakedLootBeast[]> {
  // The collection grid and the Loot Bag strip both ask for these: share one read.
  const key = BigInt(owner).toString();
  const hit = stakedCache.get(key);
  if (hit && Date.now() - hit.at < TOKEN_IDS_TTL_MS) return hit.list;
  const list = loadStakedLootBeasts(owner);
  stakedCache.set(key, { at: Date.now(), list });
  list.catch(() => {
    if (stakedCache.get(key)?.list === list) stakedCache.delete(key);
  });
  return list;
}

const stakedCache = new Map<string, { at: number; list: Promise<StakedLootBeast[]> }>();

/** Drop cached stakes (the collection's Refresh). */
export function clearLootStakesCache(): void {
  stakedCache.clear();
}

/** Staked minus beasts since taken from the owner: what still counts as theirs. */
export async function fetchHeldStakedLootBeasts(owner: string): Promise<StakedLootBeast[]> {
  const [staked, taken] = await Promise.all([
    fetchStakedLootBeasts(owner),
    fetchTakenLootBeasts(owner).catch((err) => {
      console.warn("[loot bag] taken beasts unavailable:", err);
      return [] as TakenLootBeast[];
    }),
  ]);
  const takenIds = new Set(taken.map((t) => t.tokenId));
  return staked.filter((s) => !takenIds.has(s.tokenId));
}

async function loadStakedLootBeasts(owner: string): Promise<StakedLootBeast[]> {
  const [stakes, species] = await Promise.all([fetchLootStakes(owner), fetchBeastSpecies()]);
  const names = new Map(species.map((s) => [s.speciesId, s.name]));
  const indexed = new Map<string, Beast>();
  try {
    for (const b of await fetchBeastsByIds(stakes.map((s) => s.tokenId))) indexed.set(b.tokenId, b);
  } catch (err) {
    console.warn("[loot bag] indexed beasts unavailable, decoding token ids:", err);
  }
  return stakes.map((stake) => ({
    ...stake,
    beast: indexed.get(stake.tokenId) ?? beastFromToken(stake.tokenId, names, LOOT_DUNGEON_ADDRESS),
  }));
}

type Taking = Omit<TakenLootBeast, "beast">;

/**
 * `BeastClaimed` layout: keys [selector, adventurer_id, token_id.low, token_id.high];
 * data [encounter_xp, beast_id, prefix, suffix, health, level, recipient,
 * taken_token_id.low, taken_token_id.high, taken_from].
 * Returns the claims that took a beast from someone, or null for ordinary mints.
 */
export function parseTaking(e: { keys: string[]; data: string[]; block_number?: number; transaction_hash: string }): Taking | null {
  const takenFrom = BigInt(e.data[9] ?? "0x0");
  if (takenFrom === 0n) return null;
  const lo = BigInt(e.data[7] ?? "0x0");
  const hi = BigInt(e.data[8] ?? "0x0");
  const claimed = BigInt(e.keys[2] ?? "0x0") + (BigInt(e.keys[3] ?? "0x0") << 128n);
  const taken = lo + (hi << 128n);
  return {
    tokenId: (taken === 0n ? claimed : taken).toString(),
    newTokenId: claimed.toString(),
    takenFrom: `0x${takenFrom.toString(16)}`,
    takenBy: `0x${BigInt(e.data[6] ?? "0x0").toString(16)}`,
    adventurerId: BigInt(e.keys[1] ?? "0x0").toString(),
    block: e.block_number ?? 0,
    txHash: e.transaction_hash,
  };
}

// Every taking so far, scanned incrementally from the chain.
let takings: { list: Taking[]; nextBlock: number; at: number } = { list: [], nextBlock: LOOT_DUNGEON_START_BLOCK, at: 0 };
let takingsScan: Promise<Taking[]> | null = null;

async function scanTakings(): Promise<Taking[]> {
  if (Date.now() - takings.at < TOKEN_IDS_TTL_MS) return takings.list;
  if (takingsScan) return takingsScan;
  takingsScan = withReadProvider(async (p) => {
    const head = await p.getBlockNumber();
    const selectorKey = selector("BeastClaimed");
    const found: Taking[] = [];
    let token: string | undefined;
    for (let page = 0; page < 500; page++) {
      const res = await p.getEvents({
        address: LOOT_DUNGEON_ADDRESS,
        keys: [[selectorKey]],
        from_block: { block_number: takings.nextBlock },
        to_block: { block_number: head },
        chunk_size: 1000,
        continuation_token: token,
      });
      for (const e of res.events) {
        const t = parseTaking(e);
        if (t) found.push(t);
      }
      token = res.continuation_token;
      if (!token) break;
    }
    takings = { list: [...takings.list, ...found], nextBlock: head + 1, at: Date.now() };
    return takings.list;
  }).finally(() => {
    takingsScan = null;
  });
  return takingsScan;
}

/** Beasts taken from `owner` by other players' Loot Dungeon claims, newest first. */
export async function fetchTakenLootBeasts(owner: string): Promise<TakenLootBeast[]> {
  const me = BigInt(owner);
  const [all, species] = await Promise.all([scanTakings(), fetchBeastSpecies()]);
  const names = new Map(species.map((s) => [s.speciesId, s.name]));
  return all
    .filter((t) => BigInt(t.takenFrom) === me)
    .sort((a, b) => b.block - a.block)
    .map((t) => ({ ...t, beast: beastFromToken(t.tokenId, names, "0x0") }));
}

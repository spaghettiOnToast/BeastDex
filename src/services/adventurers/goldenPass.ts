/**
 * Golden Tokens → free Beast Mode games.
 *
 * Each Golden Token (ERC721, `GOLDEN_TOKEN_ADDRESS`) can pay for one Beast Mode
 * game per cooldown. Read from the Beast Mode dungeon on 2026-11-09:
 *   get_golden_pass(golden) = { cooldown: 604800 (7 days), game_expiration: Dynamic(864000 = 10 days), pass_expiration: 0 }
 * so the cooldown is per token, 7 days after that token was last used (not a
 * global daily/weekly reset), and a game minted with it must be played within
 * 10 days.
 *
 * One game per transaction: the dungeon's `new_game` mints with mint_nonce 0
 * and the game token id is derived from the transaction (hash + block), so a
 * second golden-pass `new_game` in the same multicall reverts with
 * "ERC721: token already minted" (simulated 2026-11-09). `new_game_batch`
 * increments the nonce but only takes tickets. Minting N games = N transactions.
 */
import { hash, type Call } from "starknet";
import { GOLDEN_TOKEN_ADDRESS } from "@provable-games/collectables";
import { collectablesClient } from "../beast/collectablesClient";
import { readRpcUrls, withReadProvider } from "../tx";

export { GOLDEN_TOKEN_ADDRESS };

/** Beast Mode dungeon (lootsurvivor.io `VITE_PUBLIC_BEAST_MODE_ADDRESS`). */
export const BEAST_MODE_DUNGEON_ADDRESS =
  (import.meta.env.VITE_BEAST_MODE_DUNGEON_ADDRESS as string | undefined) ||
  "0x075ca042091b8e1418d0510b8d6519a89222ef5f7bbceb0ff760bb3c62c98174";

export const GOLDEN_TOKEN_IMAGE_URL = "https://www.lootsurvivor.io/images/golden_token.svg";

/** Fallbacks if the on-chain config can't be read. */
export const GOLDEN_PASS_COOLDOWN_S = 604_800;
export const GOLDEN_PASS_GAME_EXPIRY_S = 864_000;

export type GoldenPassConfig = { cooldownS: number; gameExpiryS: number | null };

export type GoldenPassStatus = {
  tokenId: number;
  usable: boolean;
  /** unix seconds, 0 = never used */
  lastUsed: number;
  /** unix seconds when it can be used again (null when usable now) */
  readyAt: number | null;
};

const call = (contractAddress: string, entrypoint: string, calldata: string[]) =>
  withReadProvider((p) => p.callContract({ contractAddress, entrypoint, calldata }, "latest"));

/**
 * starknet_call against the `pre_confirmed` block (raw JSON-RPC: starknet.js
 * 7.6 doesn't know the tag), so a mint that's sequenced but not yet in
 * `latest` already shows the pass as used. Falls back to `latest`.
 */
async function callPreConfirmed(contractAddress: string, entrypoint: string, calldata: string[]): Promise<string[]> {
  for (const url of readRpcUrls()) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "starknet_call",
          params: [{ contract_address: contractAddress, entry_point_selector: hash.getSelectorFromName(entrypoint), calldata }, "pre_confirmed"],
        }),
      });
      const json = (await res.json()) as { result?: string[] };
      if (Array.isArray(json.result)) return json.result;
    } catch {
      /* try the next RPC */
    }
  }
  return call(contractAddress, entrypoint, calldata);
}

/** Option<GoldenPass> = [0 (Some), cooldown, expiration variant, (value), pass_expiration]. */
export async function fetchGoldenPassConfig(): Promise<GoldenPassConfig> {
  try {
    const r = await call(BEAST_MODE_DUNGEON_ADDRESS, "get_golden_pass", [GOLDEN_TOKEN_ADDRESS]);
    if (BigInt(r[0]) !== 0n) return { cooldownS: GOLDEN_PASS_COOLDOWN_S, gameExpiryS: GOLDEN_PASS_GAME_EXPIRY_S };
    const variant = Number(r[2]);
    return { cooldownS: Number(r[1]), gameExpiryS: variant === 0 ? null : Number(r[3]) };
  } catch {
    return { cooldownS: GOLDEN_PASS_COOLDOWN_S, gameExpiryS: GOLDEN_PASS_GAME_EXPIRY_S };
  }
}

/** Golden Token ids held by `owner` (collectables indexer; owner queries return up to 10k per page). */
export async function fetchOwnedGoldenTokenIds(owner: string): Promise<number[]> {
  const ids: number[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < 10; page++) {
    const res = await collectablesClient.goldenTokens.byOwner(owner, { limit: 10_000, ...(cursor ? { cursor } : {}) });
    ids.push(...res.items.map((t) => t.tokenId));
    cursor = res.nextCursor ?? undefined;
    if (!cursor || res.items.length === 0) break;
  }
  return [...new Set(ids)].sort((a, b) => a - b);
}

export async function isGoldenPassUsable(tokenId: number): Promise<boolean> {
  const r = await callPreConfirmed(BEAST_MODE_DUNGEON_ADDRESS, "is_golden_pass_usable", [GOLDEN_TOKEN_ADDRESS, `0x${tokenId.toString(16)}`]);
  return BigInt(r[0]) === 1n;
}

/** One token's usability and unlock time, from pre-confirmed state. */
export async function fetchGoldenPassStatus(tokenId: number, cooldownS: number): Promise<GoldenPassStatus> {
  const id = `0x${tokenId.toString(16)}`;
  const [usable, last] = await Promise.all([
    isGoldenPassUsable(tokenId),
    callPreConfirmed(BEAST_MODE_DUNGEON_ADDRESS, "golden_pass_last_used", [GOLDEN_TOKEN_ADDRESS, id]),
  ]);
  const lastUsed = Number(BigInt(last[0]));
  return { tokenId, usable, lastUsed, readyAt: usable ? null : lastUsed ? lastUsed + cooldownS : null };
}

/** Usability of each token, read straight from the dungeon (8 tokens at a time). */
export async function fetchGoldenPassStatuses(tokenIds: number[], cooldownS: number): Promise<GoldenPassStatus[]> {
  const out: GoldenPassStatus[] = [];
  for (let i = 0; i < tokenIds.length; i += 8) {
    out.push(...(await Promise.all(tokenIds.slice(i, i + 8).map((id) => fetchGoldenPassStatus(id, cooldownS)))));
  }
  return out;
}

/** `new_game(PaymentType::GoldenPass { address, token_id }, to, soulbound = false)`; no approval needed. */
export function buildGoldenPassMintCall(tokenId: number, to: string): Call {
  return {
    contractAddress: BEAST_MODE_DUNGEON_ADDRESS,
    entrypoint: "new_game",
    calldata: ["1", GOLDEN_TOKEN_ADDRESS, `0x${tokenId.toString(16)}`, to, "0"],
  };
}

/** "Sun 15 Nov, 16:51" in the viewer's locale and time zone. */
export function formatReadyDate(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toLocaleString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** True when a wallet/RPC error is the dungeon's cooldown revert. */
export const isCooldownError = (e: unknown) => /golden pass on cooldown/i.test(e instanceof Error ? e.message : String(e ?? ""));

/** "3d 4h", "5h 12m", "9m". */
export function formatCountdown(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  const d = Math.floor(s / 86_400);
  const h = Math.floor((s % 86_400) / 3_600);
  const m = Math.floor((s % 3_600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${Math.max(1, m)}m`;
}

/**
 * Poll until the pass reads as used (the mint landed) or `timeoutMs` passes.
 * For wallets that report an error after submitting anyway.
 */
export async function waitForGoldenPassUsed(tokenId: number, timeoutMs = 60_000, intervalMs = 3_000): Promise<boolean> {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    if (!(await isGoldenPassUsable(tokenId).catch(() => true))) return true;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return false;
}

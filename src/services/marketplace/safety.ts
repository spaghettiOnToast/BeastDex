/**
 * Marketplace safety checks.
 *
 * The Arcade marketplace contract is upgradeable and its admin (Cartridge) can
 * pause it or change the protocol fee. Cartridge is winding down, so before any
 * transaction that touches the marketplace we verify, and refuse on mismatch:
 *  1. on-chain: its class hash is still the reviewed one (no silent upgrade);
 *  2. indexer: the order book isn't paused and the protocol fee is within cap.
 * Also exposes indexer lag so the UI can warn when listings may be stale.
 */
import type { AccountInterface, Call } from "starknet";
import { withReadProvider } from "../tx";
import { fetchBookConfig } from "../../hooks/useArcadeBookConfig";
import { runArcadeSql } from "./arcadeSqlClient";
import { MARKETPLACE_ADDRESS } from "./constants";

/** Class hash of the Arcade marketplace as reviewed on 2026-11-07 (2nd upgrade, block 5,276,685). */
export const PINNED_MARKETPLACE_CLASS_HASH =
  "0x58fcd599b5037e899a479324dc5d09d46db2640d0587a41259ef3db0c95b858";

/** Highest protocol fee we accept, in basis points (currently 0). */
export const MAX_PROTOCOL_FEE_BPS = 500;

/** Indexer is considered stale beyond this many blocks behind the chain (~1h). */
export const STALE_INDEXER_BLOCKS = 600;

const sameFelt = (a: string, b: string) => {
  try {
    return BigInt(a) === BigInt(b);
  } catch {
    return false;
  }
};

export class MarketplaceSafetyError extends Error {}

type SafetyResult = { ok: true } | { ok: false; reason: string };

let cached: { at: number; result: SafetyResult } | null = null;
const CACHE_MS = 60_000;

export async function checkMarketplaceSafety(force = false): Promise<SafetyResult> {
  if (!force && cached && Date.now() - cached.at < CACHE_MS) return cached.result;

  let result: SafetyResult = { ok: true };
  // A failed verification (RPC error) is transient: don't cache it, so the
  // user's "try again" actually re-checks instead of hitting the cache.
  let cacheable = true;
  try {
    const classHash = await withReadProvider((p) => p.getClassHashAt(MARKETPLACE_ADDRESS, "latest"));
    if (!sameFelt(classHash, PINNED_MARKETPLACE_CLASS_HASH)) {
      result = {
        ok: false,
        reason:
          "The marketplace contract has been upgraded since BeastDex last reviewed it. Trading is disabled until it's re-checked.",
      };
    }
  } catch (err) {
    // Can't verify the contract: refuse rather than send blind.
    console.warn("[marketplace] class hash check failed:", err);
    result = { ok: false, reason: "Couldn't verify the marketplace contract. Please try again in a moment." };
    cacheable = false;
  }

  if (result.ok) {
    // Book settings come from our indexer; a missing answer doesn't block
    // (the contract check above is the trustless one).
    const book = await fetchBookConfig();
    if (book?.paused) result = { ok: false, reason: "The marketplace is paused by its operator." };
    else if (book && book.fee_num > MAX_PROTOCOL_FEE_BPS)
      result = {
        ok: false,
        reason: `The marketplace fee was raised to ${(book.fee_num / 100).toFixed(2)}%. Trading is disabled until it's reviewed.`,
      };
  }

  if (cacheable) cached = { at: Date.now(), result };
  return result;
}

const touchesMarketplace = (call: Call) =>
  sameFelt(call.contractAddress, MARKETPLACE_ADDRESS) ||
  // approvals granted to the marketplace (ERC721 set_approval_for_all / ERC20 approve)
  ((call.entrypoint === "set_approval_for_all" || call.entrypoint === "approve") &&
    Array.isArray(call.calldata) &&
    call.calldata.length > 0 &&
    sameFelt(String(call.calldata[0]), MARKETPLACE_ADDRESS));

/**
 * `account.execute` for marketplace flows: runs the safety checks first when
 * any call touches the marketplace. Revoking approval is always allowed.
 */
export async function executeMarketplaceCalls(account: Pick<AccountInterface, "execute">, calls: Call | Call[]) {
  const list = Array.isArray(calls) ? calls : [calls];
  const isRevokeOnly = list.every(
    (c) => c.entrypoint === "set_approval_for_all" && Array.isArray(c.calldata) && BigInt(String(c.calldata[1] ?? "1")) === 0n,
  );
  if (!isRevokeOnly && list.some(touchesMarketplace)) {
    const safety = await checkMarketplaceSafety();
    if (!safety.ok) throw new MarketplaceSafetyError(safety.reason);
  }
  return account.execute(list);
}

export type IndexerStatus = { indexedBlock: number; chainBlock: number; behind: number; stale: boolean; lastIndexedAt: number | null };

/** How far the order-book indexer is behind the chain. */
export async function fetchIndexerStatus(): Promise<IndexerStatus | null> {
  try {
    const [rows, chainBlock] = await Promise.all([
      runArcadeSql<Array<{ head: number; last_block_timestamp: number | null }>>(
        // The marketplace is a system of the indexed Dojo world, so the world's
        // head is the order book's progress; ignore any other indexed contracts.
        // Slowest world wins if there were ever several.
        "SELECT head, last_block_timestamp FROM contracts WHERE contract_type = 'WORLD' ORDER BY head ASC LIMIT 1",
        "fetchIndexerStatus",
      ),
      withReadProvider((p) => p.getBlockNumber()),
    ]);
    const indexedBlock = Number(rows[0]?.head ?? 0);
    if (!indexedBlock) return null;
    const behind = Math.max(0, chainBlock - indexedBlock);
    return {
      indexedBlock,
      chainBlock,
      behind,
      stale: behind > STALE_INDEXER_BLOCKS,
      lastIndexedAt: rows[0]?.last_block_timestamp ?? null,
    };
  } catch (err) {
    console.warn("[marketplace] indexer status check failed:", err);
    return null;
  }
}

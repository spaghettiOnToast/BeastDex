/**
 * Beasts v3 species rankings. The Sound Manager only accepts King actions
 * (Species Song effects) while the species' on-chain ranking is current:
 * every mint adds a beast the ranking doesn't cover yet, and King calls
 * revert with "Sound: stale rankings" until someone re-ranks the species.
 *
 * `update_rankings(species_id, ranked_token_ids)` is permissionless: it takes
 * every ranked beast of the species, best first, and the contract verifies
 * the count ("Wrong count") and the order ("Not strictly ranked"). The API's
 * projectedRank is that order, so we build the list from it.
 */
import { transaction, type Call } from "starknet";
import { collectablesClient } from "./collectablesClient";
import { BEASTS_V3_ADDRESS } from "./constants";
import { withReadProvider } from "../tx";

export type RankingInfo = {
  /** beasts the current on-chain ranking covers */
  ranked: number;
  /** rankable beasts of the species (Genesis mints are never ranked) */
  total: number;
  /** block of the last `update_rankings` */
  updatedAtBlock: number;
};

/** `get_ranking_info(species)` -> (ranked, total, last update block). */
export async function fetchRankingInfo(speciesId: number): Promise<RankingInfo> {
  const [ranked = "0", total = "0", block = "0"] = await withReadProvider((p) =>
    p.callContract(
      { contractAddress: BEASTS_V3_ADDRESS, entrypoint: "get_ranking_info", calldata: [String(speciesId)] },
      "latest",
    ),
  );
  return { ranked: Number(BigInt(ranked)), total: Number(BigInt(total)), updatedAtBlock: Number(BigInt(block)) };
}

/** New beasts were minted since the last ranking: King actions will revert until it's refreshed. */
export function rankingsStale(info: RankingInfo): boolean {
  return info.ranked !== info.total;
}

/**
 * Every rankable beast of a species in rank order (API projectedRank, Genesis
 * excluded), checked against the contract's expected count.
 */
export async function fetchSpeciesRankedIds(speciesId: number, expected: number): Promise<string[]> {
  const rows: { tokenId: string; rank: number }[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < 200; page++) {
    const res = await collectablesClient.beasts.list({
      beastId: speciesId,
      sort: "projected_rank",
      order: "asc",
      limit: 100,
      ...(cursor ? { cursor } : {}),
    });
    for (const b of res.items) {
      const rank = b.projectedRank ?? 0;
      if (!b.genesis && rank > 0) rows.push({ tokenId: String(b.tokenId), rank });
    }
    cursor = res.nextCursor ?? undefined;
    if (!cursor) break;
  }
  rows.sort((a, b) => a.rank - b.rank);
  if (rows.length !== expected) {
    throw new Error(
      `The ranking list has ${rows.length} beasts but the contract expects ${expected}. The indexer may be catching up; try again in a minute.`,
    );
  }
  return rows.map((r) => r.tokenId);
}

export function updateRankingsCall(speciesId: number, rankedTokenIds: string[]): Call {
  return {
    contractAddress: BEASTS_V3_ADDRESS,
    entrypoint: "update_rankings",
    calldata: [String(speciesId), String(rankedTokenIds.length), ...rankedTokenIds],
  };
}

/** Pull the contract's own reason out of a failed estimate (Argent wraps it in "argent/multicall-failed"). */
export function revertReason(err: unknown): string {
  const text = err instanceof Error ? err.message : String(err ?? "");
  const reasons = [...text.matchAll(/\('([^']+)'\)/g)]
    .map((m) => m[1])
    .filter((r) => r && r !== "argent/multicall-failed" && r !== "ENTRYPOINT_FAILED");
  return reasons[0] ?? text;
}

/**
 * Network fee (FRI) the account would pay for these calls, by simulating them
 * (signature validation skipped). Throws with the revert reason when the
 * calls would fail, so we can explain it before the wallet opens.
 */
export async function estimateCallsFeeFri(sender: string, calls: Call[]): Promise<bigint> {
  return withReadProvider(async (p) => {
    const nonce = await p.getNonceForAddress(sender, "latest");
    const est = await p.getInvokeEstimateFee(
      { contractAddress: sender, calldata: transaction.getExecuteCalldata(calls, "1"), signature: [] },
      {
        nonce,
        version: "0x3",
        // Zero bounds: an estimate only needs the calls to run, not to be payable.
        resourceBounds: {
          l1_gas: { max_amount: "0x0", max_price_per_unit: "0x0" },
          l2_gas: { max_amount: "0x0", max_price_per_unit: "0x0" },
          l1_data_gas: { max_amount: "0x0", max_price_per_unit: "0x0" },
        },
        tip: 0,
        paymasterData: [],
        accountDeploymentData: [],
        nonceDataAvailabilityMode: "L1",
        feeDataAvailabilityMode: "L1",
      } as never,
      "latest",
      true,
    );
    return BigInt(est.overall_fee);
  });
}

/** FRI -> "1.64" STRK. */
export function formatStrk(fri: bigint): string {
  const n = Number(fri) / 1e18;
  return n >= 0.1 ? n.toFixed(2) : n.toPrecision(2);
}

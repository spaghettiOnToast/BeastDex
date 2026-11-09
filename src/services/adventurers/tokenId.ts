/**
 * Decoder for v2 game-core token ids ("packet" layout, schema 1), mirroring
 * the lootsurvivor.io client. Everything immutable about a game is packed into
 * its 251-bit id:
 *
 *   bits     width  field
 *   0–4        5    schema_version (1)
 *   5–20      16    tx_hash fragment
 *   21–31     11    mint_nonce
 *   32–63     32    minted_at_block_number
 *   64–90     27    minted_at_timestamp (minutes)
 *   91–108    18    start_delay (minutes)
 *   109–127   19    play_duration (minutes; 0 = no limit)
 *   128–147   20    settings_id
 *   148–167   20    objective_id
 *   168–191   24    minted_by (minter id → dungeon)
 *   192–248   57    minter_data
 *   249        1    soulbound
 *   250        1    paymaster
 */

export type DecodedGameToken = {
  schemaVersion: number;
  mintNonce: number;
  mintedAtBlock: number;
  /** unix seconds */
  mintedAt: number;
  /** seconds */
  startDelay: number;
  /** seconds; 0 = no time limit */
  playDuration: number;
  settingsId: number;
  objectiveId: number;
  minterId: number;
  minterData: bigint;
  soulbound: boolean;
  paymaster: boolean;
};

const FELT_MAX = (1n << 251n) + 17n * (1n << 192n);

export function decodeGameTokenId(tokenId: string | bigint): DecodedGameToken | null {
  let t: bigint;
  try {
    t = typeof tokenId === "bigint" ? tokenId : BigInt(tokenId);
  } catch {
    return null;
  }
  if (t <= 0n || t > FELT_MAX) return null;
  const bits = (offset: number, width: number) => (t >> BigInt(offset)) & ((1n << BigInt(width)) - 1n);
  const n = (offset: number, width: number) => Number(bits(offset, width));
  const schemaVersion = n(0, 5);
  if (schemaVersion !== 1) return null;
  return {
    schemaVersion,
    mintNonce: n(21, 11),
    mintedAtBlock: n(32, 32),
    mintedAt: n(64, 27) * 60,
    startDelay: n(91, 18) * 60,
    playDuration: n(109, 19) * 60,
    settingsId: n(128, 20),
    objectiveId: n(148, 20),
    minterId: n(168, 24),
    minterData: bits(192, 57),
    soulbound: bits(249, 1) === 1n,
    paymaster: bits(250, 1) === 1n,
  };
}

/** When a game stops being playable (unix seconds), or null if it never expires. */
export function gameExpiresAt(decoded: DecodedGameToken): number | null {
  return decoded.playDuration > 0 ? decoded.mintedAt + decoded.startDelay + decoded.playDuration : null;
}

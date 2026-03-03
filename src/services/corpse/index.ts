/**
 * Corpse Service
 *
 * Fetches dead adventurers from Torii SQL, filters out already-claimed ones
 * via the summit API, and builds batch claim transactions for the CORPSE token.
 */

import { addAddressPadding, CallData } from "starknet";
import { createSqlClient } from "../shared/sqlClient";
import { SUMMIT_API_URL } from "../summitApi/constants";

// --- Constants ---

const CORPSE_CONTRACT =
  "0x0103eafe79f8631932530cc687dfcdeb013c883a82619ebf81be393e2953a87a";
const DUNGEON_ADDRESS =
  "0x00a67ef20b61a9846e1c82b411175e6ab167ea9f8632bd6c2091823c3629ec42";
const NAMESPACE = "relayer_0_0_1";
const BATCH_LIMIT = 250;

const TORII_SQL_ENDPOINT = import.meta.env.DEV
  ? "/summit-torii/sql"
  : "https://api.cartridge.gg/x/pg-mainnet-10/torii/sql";

const runCorpseSql = createSqlClient({
  endpoint: TORII_SQL_ENDPOINT,
  label: "Corpse",
  defaultOptions: { retries: 2, baseDelayMs: 1000, timeoutMs: 30_000 },
});

// --- Types ---

export interface DeadAdventurer {
  id: number;
  score: number;
  level: number;
}

interface AdventurerRow {
  token_id: string;
  score: string;
}

// --- Fetch dead adventurers ---

export async function fetchDeadAdventurers(
  owner: string,
): Promise<DeadAdventurer[]> {
  const paddedOwner = addAddressPadding(owner.toLowerCase());
  const paddedDungeon = addAddressPadding(DUNGEON_ADDRESS);

  // Fetch dead adventurers and claimed IDs in parallel
  const [rows, claimedIds] = await Promise.all([
    (async () => {
      const query = `
        SELECT o.token_id, tm.minted_by, tm.id, tm.game_over, s.score
        FROM '${NAMESPACE}-TokenMetadataUpdate' tm
        LEFT JOIN '${NAMESPACE}-TokenScoreUpdate' s ON s.id = tm.id
        LEFT JOIN '${NAMESPACE}-OwnersUpdate' o ON o.token_id = tm.id
        LEFT JOIN '${NAMESPACE}-MinterRegistryUpdate' mr ON mr.id = tm.minted_by
        WHERE o.owner = "${paddedOwner}"
        AND mr.minter_address = "${paddedDungeon}"
        AND tm.game_over = 1
      `;
      return runCorpseSql<AdventurerRow[]>(query, "fetchDeadAdventurers");
    })(),
    fetchClaimedAdventurerIds(owner).catch(() => [] as string[]),
  ]);

  // Build a Set of already-claimed IDs for O(1) lookup
  const claimedSet = new Set(claimedIds.map((id) => Number(id)));

  return rows
    .map((row) => {
      const score = parseInt(row.score, 16) || 0;
      return {
        id: parseInt(row.token_id, 16),
        score,
        level: Math.floor(Math.sqrt(score)),
      };
    })
    .filter((adv) => !claimedSet.has(adv.id));
}

// --- Fetch already-claimed adventurer IDs ---

async function fetchClaimedAdventurerIds(owner: string): Promise<string[]> {
  const url = `${SUMMIT_API_URL}/adventurers/${owner}`;
  const response = await fetch(url, {
    method: "GET",
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) return [];

  const data = (await response.json()) as { adventurer_ids?: string[] };
  return data.adventurer_ids ?? [];
}

// --- Build claim transactions ---

export interface ClaimCall {
  contractAddress: string;
  entrypoint: string;
  calldata: string[];
}

export function buildClaimCalls(adventurerIds: number[]): ClaimCall[] {
  const calls: ClaimCall[] = [];
  for (let i = 0; i < adventurerIds.length; i += BATCH_LIMIT) {
    const batch = adventurerIds.slice(i, i + BATCH_LIMIT);
    calls.push({
      contractAddress: CORPSE_CONTRACT,
      entrypoint: "claim",
      calldata: CallData.compile([batch]),
    });
  }
  return calls;
}

export { BATCH_LIMIT };

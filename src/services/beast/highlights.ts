import { lookupControllerUsernames } from "../controller";
import { runBeastSql } from "./sqlClient";
import {
  BEAST_STATS_CACHE_TTL_MS,
  CONTRACT_ADDRESS,
  ZERO_BALANCE,
} from "./constants";
import type { BeastHighlights } from "./types";
import { normaliseStarknetAddress } from "../../utils/address";

const BOOLEAN_TRUE_VALUES = ["1", "true", "True", "TRUE"]; // coarse normalization

const EXCLUDED_ADDRESS = "0x07bdeac5b256fa53c11b0bc0368af72916203987429032f37254465ee4ec078b";

function buildBaseCte() {
  return `
    WITH base AS (
      SELECT
        t.id,
        LOWER(b.account_address) AS owner,
        json_extract(attr.value, '$.trait_type') AS trait,
        json_extract(attr.value, '$.value') AS value
      FROM tokens t
      JOIN token_balances b
        ON t.id = b.token_id
       AND t.contract_address = b.contract_address
      JOIN json_each(
        CASE
          WHEN json_valid(t.metadata) = 1 THEN t.metadata
          ELSE '{"attributes":[]}'
        END,
        '$.attributes'
      ) attr
      WHERE t.contract_address = '${CONTRACT_ADDRESS}'
        AND b.balance > '${ZERO_BALANCE}'
        AND json_valid(t.metadata) = 1
        AND json_extract(attr.value, '$.trait_type') IS NOT NULL
        AND json_extract(attr.value, '$.value') IS NOT NULL
        AND LOWER(b.account_address) != '${EXCLUDED_ADDRESS.toLowerCase()}'
    ),
    normalized AS (
      SELECT
        id,
        owner,
        MAX(CASE WHEN LOWER(trait) LIKE 'shiny%' AND value IN ('${BOOLEAN_TRUE_VALUES.join(
          "','"
        )}') THEN 1 ELSE 0 END) AS is_shiny,
        MAX(CASE WHEN LOWER(trait) LIKE 'animated%' AND value IN ('${BOOLEAN_TRUE_VALUES.join(
          "','"
        )}') THEN 1 ELSE 0 END) AS is_animated
      FROM base
      GROUP BY id, owner
    )
  `;
}

let highlightsCache: { data: BeastHighlights; expiresAt: number } | null = null;

export async function fetchBeastHighlights(forceRefresh = false): Promise<BeastHighlights> {
  const now = Date.now();
  if (!forceRefresh && highlightsCache && highlightsCache.expiresAt > now) {
    return highlightsCache.data;
  }

  const baseCte = buildBaseCte();

  const countsQuery = `
    ${baseCte}
    SELECT
      (SELECT COUNT(*) FROM normalized WHERE is_shiny = 1 AND is_animated = 1) AS animated_shiny_count,
      (SELECT COUNT(*) FROM normalized WHERE is_shiny = 1) AS shiny_count,
      (SELECT COUNT(*) FROM normalized WHERE is_animated = 1) AS animated_count;
  `;

  const leaderboardQuery = `
    ${baseCte}
    SELECT 'overall' AS category, owner, value FROM (
      SELECT owner, COUNT(*) AS value
      FROM normalized
      GROUP BY owner
      ORDER BY value DESC
      LIMIT 1
    )
    UNION ALL
    SELECT 'animated_shiny' AS category, owner, value FROM (
      SELECT owner, COUNT(*) AS value
      FROM normalized
      WHERE is_shiny = 1 AND is_animated = 1
      GROUP BY owner
      ORDER BY value DESC
      LIMIT 1
    )
    UNION ALL
    SELECT 'shiny' AS category, owner, value FROM (
      SELECT owner, COUNT(*) AS value
      FROM normalized
      WHERE is_shiny = 1
      GROUP BY owner
      ORDER BY value DESC
      LIMIT 1
    )
    UNION ALL
    SELECT 'animated' AS category, owner, value FROM (
      SELECT owner, COUNT(*) AS value
      FROM normalized
      WHERE is_animated = 1
      GROUP BY owner
      ORDER BY value DESC
      LIMIT 1
    );
  `;

  const countsRows = await runBeastSql<Array<{ animated_shiny_count: number; shiny_count: number; animated_count: number }>>(
    countsQuery,
    "fetchBeastHighlights-counts"
  );

  const leaderboardRows = await runBeastSql<Array<{ category: string; owner: string | null; value: number }>>(
    leaderboardQuery,
    "fetchBeastHighlights-leaderboards"
  );

  const counts = countsRows?.[0] ?? {
    animated_shiny_count: 0,
    shiny_count: 0,
    animated_count: 0,
  };

  const leaders = leaderboardRows ?? [];
  const leaderMap = leaders.reduce<Record<string, { owner: string | null; value: number }>>((acc, row) => {
    if (!acc[row.category]) {
      acc[row.category] = { owner: row.owner ?? null, value: row.value ?? 0 };
    }
    return acc;
  }, {});

  const uniqueAddresses = Array.from(
    new Set(
      leaders
        .map((row) => row.owner)
        .filter((owner): owner is string => typeof owner === "string" && owner.length > 0)
    )
  );

  const usernamesLookup = uniqueAddresses.length
    ? await lookupControllerUsernames(uniqueAddresses)
    : {};

  function enrich(category: string) {
    const entry = leaderMap[category];
    if (!entry || !entry.owner) {
      return { owner: null, username: null, value: 0 };
    }
    const address = entry.owner.toLowerCase();
    const normalizedAddress = normaliseStarknetAddress(address);
    const username = normalizedAddress ? usernamesLookup[normalizedAddress] ?? null : null;

    return {
      owner: address,
      username,
      value: entry.value ?? 0,
    };
  }

  const data: BeastHighlights = {
    animatedShinyCount: counts.animated_shiny_count ?? 0,
    shinyCount: counts.shiny_count ?? 0,
    animatedCount: counts.animated_count ?? 0,
    leaders: {
      overall: enrich("overall"),
      animatedShiny: enrich("animated_shiny"),
      shiny: enrich("shiny"),
      animated: enrich("animated"),
    },
  };

  highlightsCache = {
    data,
    expiresAt: now + BEAST_STATS_CACHE_TTL_MS,
  };

  return data;
}

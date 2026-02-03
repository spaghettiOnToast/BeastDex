import { lookupControllerUsernames } from "../controller";
import { runBeastSql } from "./sqlClient";
import {
  BEAST_STATS_CACHE_TTL_MS,
  CONTRACT_ADDRESS,
  EXCLUDED_OWNER_ADDRESS,
  ZERO_BALANCE,
} from "./constants";
import type { BeastHighlights } from "./types";
import { normaliseStarknetAddress } from "../../utils/address";

const BOOLEAN_TRUE_VALUES = ["1", "true", "True", "TRUE"];

// Base CTE for normalized beast data
const baseCte = `
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
      AND LOWER(b.account_address) != '${EXCLUDED_OWNER_ADDRESS.toLowerCase()}'
  ),
  normalized AS (
    SELECT
      id,
      owner,
      MAX(CASE WHEN LOWER(trait) LIKE 'shiny%' AND value IN ('${BOOLEAN_TRUE_VALUES.join("','")}') THEN 1 ELSE 0 END) AS is_shiny,
      MAX(CASE WHEN LOWER(trait) LIKE 'animated%' AND value IN ('${BOOLEAN_TRUE_VALUES.join("','")}') THEN 1 ELSE 0 END) AS is_animated
    FROM base
    GROUP BY id, owner
  )
`;

let highlightsCache: { data: BeastHighlights; expiresAt: number } | null = null;

export async function fetchBeastHighlights(forceRefresh = false): Promise<BeastHighlights> {
  const now = Date.now();
  if (!forceRefresh && highlightsCache && highlightsCache.expiresAt > now) {
    return highlightsCache.data;
  }

  // Single combined query - computes counts and leaderboards in one pass
  // This avoids running the expensive baseCte twice
  const combinedQuery = `
    ${baseCte},
    counts AS (
      SELECT
        SUM(CASE WHEN is_shiny = 1 AND is_animated = 1 THEN 1 ELSE 0 END) AS animated_shiny_count,
        SUM(CASE WHEN is_shiny = 1 AND is_animated = 0 THEN 1 ELSE 0 END) AS shiny_count,
        SUM(CASE WHEN is_shiny = 0 AND is_animated = 1 THEN 1 ELSE 0 END) AS animated_count,
        SUM(CASE WHEN is_shiny = 0 AND is_animated = 0 THEN 1 ELSE 0 END) AS standard_count
      FROM normalized
    ),
    overall_leader AS (
      SELECT owner, COUNT(*) AS value FROM normalized GROUP BY owner ORDER BY value DESC LIMIT 1
    ),
    animated_shiny_leader AS (
      SELECT owner, COUNT(*) AS value FROM normalized WHERE is_shiny = 1 AND is_animated = 1 GROUP BY owner ORDER BY value DESC LIMIT 1
    ),
    shiny_leader AS (
      SELECT owner, COUNT(*) AS value FROM normalized WHERE is_shiny = 1 GROUP BY owner ORDER BY value DESC LIMIT 1
    ),
    animated_leader AS (
      SELECT owner, COUNT(*) AS value FROM normalized WHERE is_animated = 1 GROUP BY owner ORDER BY value DESC LIMIT 1
    )
    SELECT
      c.animated_shiny_count,
      c.shiny_count,
      c.animated_count,
      c.standard_count,
      ol.owner AS overall_owner,
      ol.value AS overall_value,
      asl.owner AS animated_shiny_owner,
      asl.value AS animated_shiny_value,
      sl.owner AS shiny_owner,
      sl.value AS shiny_value,
      al.owner AS animated_owner,
      al.value AS animated_value
    FROM counts c
    LEFT JOIN overall_leader ol ON 1=1
    LEFT JOIN animated_shiny_leader asl ON 1=1
    LEFT JOIN shiny_leader sl ON 1=1
    LEFT JOIN animated_leader al ON 1=1;
  `;

  type CombinedRow = {
    animated_shiny_count: number;
    shiny_count: number;
    animated_count: number;
    standard_count: number;
    overall_owner: string | null;
    overall_value: number | null;
    animated_shiny_owner: string | null;
    animated_shiny_value: number | null;
    shiny_owner: string | null;
    shiny_value: number | null;
    animated_owner: string | null;
    animated_value: number | null;
  };

  const rows = await runBeastSql<CombinedRow[]>(combinedQuery, "fetchBeastHighlights-combined");
  const row = rows?.[0];

  if (!row) {
    const emptyData: BeastHighlights = {
      animatedShinyCount: 0,
      shinyCount: 0,
      animatedCount: 0,
      standardCount: 0,
      leaders: {
        overall: { owner: null, username: null, value: 0 },
        animatedShiny: { owner: null, username: null, value: 0 },
        shiny: { owner: null, username: null, value: 0 },
        animated: { owner: null, username: null, value: 0 },
      },
    };
    highlightsCache = { data: emptyData, expiresAt: now + BEAST_STATS_CACHE_TTL_MS };
    return emptyData;
  }

  // Collect unique addresses for username lookup
  const uniqueAddresses = Array.from(
    new Set(
      [row.overall_owner, row.animated_shiny_owner, row.shiny_owner, row.animated_owner]
        .filter((owner): owner is string => typeof owner === "string" && owner.length > 0)
    )
  );

  // Lookup usernames (this is typically fast with caching)
  const usernamesLookup = uniqueAddresses.length
    ? await lookupControllerUsernames(uniqueAddresses)
    : {};

  function enrichLeader(owner: string | null, value: number | null) {
    if (!owner) {
      return { owner: null, username: null, value: 0 };
    }
    const address = owner.toLowerCase();
    const normalizedAddress = normaliseStarknetAddress(address);
    const username = normalizedAddress ? usernamesLookup[normalizedAddress] ?? null : null;

    return {
      owner: address,
      username,
      value: value ?? 0,
    };
  }

  const data: BeastHighlights = {
    animatedShinyCount: row.animated_shiny_count ?? 0,
    shinyCount: row.shiny_count ?? 0,
    animatedCount: row.animated_count ?? 0,
    standardCount: row.standard_count ?? 0,
    leaders: {
      overall: enrichLeader(row.overall_owner, row.overall_value),
      animatedShiny: enrichLeader(row.animated_shiny_owner, row.animated_shiny_value),
      shiny: enrichLeader(row.shiny_owner, row.shiny_value),
      animated: enrichLeader(row.animated_owner, row.animated_value),
    },
  };

  highlightsCache = {
    data,
    expiresAt: now + BEAST_STATS_CACHE_TTL_MS,
  };

  return data;
}

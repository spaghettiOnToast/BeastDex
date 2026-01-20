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

function buildCombinedHighlightsQuery() {
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
    ),
    counts AS (
      SELECT
        (SELECT COUNT(*) FROM normalized WHERE is_shiny = 1 AND is_animated = 1) AS animated_shiny_count,
        (SELECT COUNT(*) FROM normalized WHERE is_shiny = 1) AS shiny_count,
        (SELECT COUNT(*) FROM normalized WHERE is_animated = 1) AS animated_count,
        (SELECT COUNT(*) FROM normalized WHERE is_shiny = 0 AND is_animated = 0) AS standard_count
    ),
    leader_overall AS (
      SELECT 'overall' AS category, owner, COUNT(*) AS value
      FROM normalized
      GROUP BY owner
      ORDER BY value DESC
      LIMIT 1
    ),
    leader_animated_shiny AS (
      SELECT 'animated_shiny' AS category, owner, COUNT(*) AS value
      FROM normalized
      WHERE is_shiny = 1 AND is_animated = 1
      GROUP BY owner
      ORDER BY value DESC
      LIMIT 1
    ),
    leader_shiny AS (
      SELECT 'shiny' AS category, owner, COUNT(*) AS value
      FROM normalized
      WHERE is_shiny = 1
      GROUP BY owner
      ORDER BY value DESC
      LIMIT 1
    ),
    leader_animated AS (
      SELECT 'animated' AS category, owner, COUNT(*) AS value
      FROM normalized
      WHERE is_animated = 1
      GROUP BY owner
      ORDER BY value DESC
      LIMIT 1
    )
    SELECT
      'counts' AS row_type,
      NULL AS category,
      NULL AS owner,
      NULL AS value,
      c.animated_shiny_count,
      c.shiny_count,
      c.animated_count,
      c.standard_count
    FROM counts c
    UNION ALL
    SELECT 'leader', category, owner, value, NULL, NULL, NULL, NULL FROM leader_overall
    UNION ALL
    SELECT 'leader', category, owner, value, NULL, NULL, NULL, NULL FROM leader_animated_shiny
    UNION ALL
    SELECT 'leader', category, owner, value, NULL, NULL, NULL, NULL FROM leader_shiny
    UNION ALL
    SELECT 'leader', category, owner, value, NULL, NULL, NULL, NULL FROM leader_animated;
  `;
}

type CombinedRow = {
  row_type: "counts" | "leader";
  category: string | null;
  owner: string | null;
  value: number | null;
  animated_shiny_count: number | null;
  shiny_count: number | null;
  animated_count: number | null;
  standard_count: number | null;
};

let highlightsCache: { data: BeastHighlights; expiresAt: number } | null = null;

export async function fetchBeastHighlights(forceRefresh = false): Promise<BeastHighlights> {
  const now = Date.now();
  if (!forceRefresh && highlightsCache && highlightsCache.expiresAt > now) {
    return highlightsCache.data;
  }

  const query = buildCombinedHighlightsQuery();
  const rows = await runBeastSql<CombinedRow[]>(query, "fetchBeastHighlights");

  // Parse counts from the first row
  const countsRow = rows?.find((r) => r.row_type === "counts");
  const counts = {
    animated_shiny_count: countsRow?.animated_shiny_count ?? 0,
    shiny_count: countsRow?.shiny_count ?? 0,
    animated_count: countsRow?.animated_count ?? 0,
    standard_count: countsRow?.standard_count ?? 0,
  };

  // Parse leaders from remaining rows
  const leaderRows = rows?.filter((r) => r.row_type === "leader") ?? [];
  const leaderMap = leaderRows.reduce<Record<string, { owner: string | null; value: number }>>((acc, row) => {
    if (row.category && !acc[row.category]) {
      acc[row.category] = { owner: row.owner ?? null, value: row.value ?? 0 };
    }
    return acc;
  }, {});

  // Lookup usernames for leaders
  const uniqueAddresses = Array.from(
    new Set(
      leaderRows
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
    standardCount: counts.standard_count ?? 0,
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

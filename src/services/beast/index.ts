import { mapBeastRow, type BeastRow } from "./helpers";
import {
  buildAttributeFiltersQuery,
  buildBeastsQuery,
  buildBeastByIdQuery,
  buildOwnerBeastStatsQuery,
} from "./queries";
import { runBeastSql } from "./sqlClient";
import { normaliseStarknetAddress } from "../../utils/address";
import { CONTRACT_ADDRESS, EXCLUDED_OWNER_ADDRESS, ZERO_BALANCE } from "./constants";
import type {
  Beast,
  BeastAttributeFilters,
  BeastPowerRank,
  BeastHealthRank,
  FetchBeastsOptions,
  FetchLeaderboardOptions,
  PowerRankLeaderboard,
  BeastCollectionLeaderboard,
  BeastRarityLeaderboardCategory,
  BeastSlayerEntry,
  BeastNameLeaderboardEntry,
} from "./types";
import { fetchBeastStats } from "./stats";
import { fetchBeastHighlights } from "./highlights";
import { apiCache } from "../apiCache";

export { TOTAL_BEAST_SUPPLY } from "./constants";
export { fetchBeastStats, fetchBeastHighlights };
export type {
  AttributeFilterInput,
  Beast,
  BeastAttribute,
  BeastAttributeFilters,
  BeastHighlights,
  BeastHighlightsLeader,
  BeastMetadata,
  BeastPowerRank,
  BeastHealthRank,
  BeastStats,
  PowerRankLeaderboard,
  BeastCollectionLeaderboard,
  FetchLeaderboardOptions,
  BeastRarityLeaderboardCategory,
  BeastSlayerEntry,
  BeastNameLeaderboardEntry,
} from "./types";

export type OwnerBeastStats = {
  totalBeasts: number;
  totalPower: number;
  uniqueBeastTypes: number;
  uniqueTiers: number;
  maxPower: number;
};

export type FetchBeastsResponse = {
  beasts: Beast[];
  total: number;
};

export async function fetchBeasts({
  limit = 20,
  search = "",
  attributeFilters = {},
  ownerAddresses = [],
  page = 1,
  sort = "default",
}: FetchBeastsOptions = {}): Promise<FetchBeastsResponse> {
  const params = { limit, search, attributeFilters, ownerAddresses, page, sort };

  return apiCache.get("beast-query", params, async () => {
    const query = buildBeastsQuery(params);
    const rows = await runBeastSql<BeastRow[]>(query, "fetchBeasts");
    const beasts = rows.map(mapBeastRow);
    const total =
      rows.length > 0 ? Number(rows[0]?.total_count ?? beasts.length) : 0;

    return { beasts, total };
  });
}

function deriveTokenHex(identifier: string): string | null {
  const trimmed = identifier.trim();
  if (trimmed.length === 0) {
    return null;
  }

  const numericMatch = /^\d+$/.test(trimmed);
  if (numericMatch) {
    try {
      const hex = BigInt(trimmed).toString(16);
      return `0x${hex.padStart(64, "0")}`;
    } catch (error) {
      console.warn(
        "⚠️ Failed to derive token hex from numeric id",
        error,
        trimmed
      );
      return null;
    }
  }

  if (trimmed.includes(":")) {
    const tail = trimmed.slice(trimmed.lastIndexOf(":") + 1);
    if (/^0x[0-9a-f]+$/i.test(tail)) {
      return tail.toLowerCase().startsWith("0x")
        ? tail.toLowerCase()
        : `0x${tail.toLowerCase()}`;
    }
  }

  if (/^0x[0-9a-f]+$/i.test(trimmed)) {
    return trimmed.toLowerCase();
  }

  return null;
}

export async function fetchBeastById(
  id: string | number
): Promise<Beast | null> {
  const identifier = String(id);

  return apiCache.get("beast-by-id", { id: identifier }, async () => {
    const tokenHex = deriveTokenHex(identifier);
    const query = buildBeastByIdQuery(identifier, tokenHex ?? undefined);
    const rows = await runBeastSql<BeastRow[]>(query, "fetchBeastById");

    if (!rows || rows.length === 0) {
      return null;
    }

    return mapBeastRow(rows[0]);
  });
}

export async function fetchBeastsByIds(
  ids: (string | number)[]
): Promise<Beast[]> {
  if (ids.length === 0) {
    return [];
  }

  // Fetch all beasts in parallel
  const results = await Promise.all(
    ids.map(id => fetchBeastById(id))
  );

  // Filter out nulls and return only valid beasts
  return results.filter((beast): beast is Beast => beast !== null);
}

export async function fetchBeastAttributeFilters(): Promise<BeastAttributeFilters> {
  return apiCache.get("beast-filters", {}, async () => {
    const query = buildAttributeFiltersQuery();
    const rows = await runBeastSql<
      Array<{ trait_type?: string | null; values_json?: string | null }>
    >(query, "fetchBeastAttributeFilters");

    return rows.reduce<BeastAttributeFilters>((acc, row) => {
      const trait = row?.trait_type;
      const rawValues = row?.values_json;
      let values: unknown[] = [];

      if (typeof rawValues === "string" && rawValues.length > 0) {
        try {
          const parsed = JSON.parse(rawValues);
          if (Array.isArray(parsed)) {
            values = parsed;
          }
        } catch (error) {
          console.warn(
            "⚠️ Failed to parse attribute filter values JSON",
            error,
            rawValues
          );
        }
      }

      if (typeof trait === "string" && trait.length > 0) {
        acc[trait] = values
          .map((value: unknown) => (value == null ? null : String(value)))
          .filter((value): value is string => Boolean(value));
      }

      return acc;
    }, {});
  });
}

export async function fetchBeastPowerRank(
  ownerAddress: string
): Promise<BeastPowerRank | null> {
  const normalised = normaliseStarknetAddress(ownerAddress);
  if (!normalised) return null;

  return apiCache.get("beast-power-rank", { address: normalised }, async () => {
    const variants = new Set<string>();
    variants.add(normalised.toLowerCase());
    if (normalised.startsWith("0x")) {
      const padded = `0x${normalised.slice(2).padStart(64, "0")}`;
      variants.add(padded.toLowerCase());
    }

    if (variants.size === 0) return null;

    const addressList = Array.from(variants)
      .map((address) => `'${address.replace(/'/g, "''")}'`)
      .join(", ");

    const query = `
      WITH owner_powers AS (
        SELECT
          LOWER(b.account_address) AS owner,
          COALESCE(
            (
              SELECT MAX(
                CAST(
                  CASE
                    WHEN json_valid(t.metadata) = 1
                     AND json_type(attr.value, '$.value') IN ('text', 'integer', 'real')
                      THEN json_extract(attr.value, '$.value')
                    ELSE 0
                  END AS REAL
                )
              )
              FROM json_each(
                CASE
                  WHEN json_valid(t.metadata) = 1 THEN t.metadata
                  ELSE '{"attributes":[]}'
                END, '$.attributes'
              ) attr
              WHERE LOWER(json_extract(attr.value, '$.trait_type')) LIKE '%power%'
                AND json_extract(attr.value, '$.trait_type') IS NOT NULL
                AND json_extract(attr.value, '$.value') IS NOT NULL
            ),
            0
          ) AS power
        FROM tokens t
        JOIN token_balances b
          ON t.id = b.token_id
         AND t.contract_address = b.contract_address
        WHERE t.contract_address = '${CONTRACT_ADDRESS}'
          AND b.balance > '${ZERO_BALANCE}'
          AND b.account_address IS NOT NULL
      ),
      owner_totals AS (
        SELECT
          owner,
          SUM(power) AS total_power
        FROM owner_powers
        GROUP BY owner
      ),
      ranked AS (
        SELECT
          owner,
          total_power,
          RANK() OVER (ORDER BY total_power DESC) AS rank
        FROM owner_totals
      )
      SELECT
        rank,
        total_power,
        (SELECT COUNT(*) FROM owner_totals) AS total_owners
      FROM ranked
      WHERE owner IN (${addressList})
      ORDER BY rank ASC
      LIMIT 1;
    `;

    type RankRow = {
      rank?: number | string | null;
      total_power?: number | string | null;
      total_owners?: number | string | null;
    };

    const rows = await runBeastSql<RankRow[]>(query, "fetchBeastPowerRank");
    if (!rows || rows.length === 0) {
      return { rank: null, totalPower: 0, totalOwners: 0 };
    }

    const [row] = rows;

    const parsedRank = row?.rank != null ? Number(row.rank) : null;
    const rank = Number.isFinite(parsedRank ?? NaN) ? parsedRank : null;

    const rawTotalPower = row?.total_power;
    const totalPower =
      typeof rawTotalPower === "number"
        ? rawTotalPower
        : Number(rawTotalPower ?? 0);

    const rawOwners = row?.total_owners;
    const totalOwners =
      typeof rawOwners === "number" ? rawOwners : Number(rawOwners ?? 0);

    return {
      rank,
      totalPower: Number.isFinite(totalPower) ? totalPower : 0,
      totalOwners: Number.isFinite(totalOwners) ? totalOwners : 0,
    };
  });
}

// Combined power and health rank query - much more efficient than separate queries
export async function fetchBeastCombinedRanks(
  ownerAddress: string
): Promise<{ powerRank: BeastPowerRank | null; healthRank: BeastHealthRank | null }> {
  const normalised = normaliseStarknetAddress(ownerAddress);
  if (!normalised) {
    return { powerRank: null, healthRank: null };
  }

  return apiCache.get("beast-combined-ranks", { address: normalised }, async () => {
    const variants = new Set<string>();
    variants.add(normalised.toLowerCase());
    if (normalised.startsWith("0x")) {
      const padded = `0x${normalised.slice(2).padStart(64, "0")}`;
      variants.add(padded.toLowerCase());
    }

    if (variants.size === 0) {
      return { powerRank: null, healthRank: null };
    }

    const addressList = Array.from(variants)
      .map((address) => `'${address.replace(/'/g, "''")}'`)
      .join(", ");

    // Single query that calculates both power and health rankings
    const query = `
      WITH owner_stats AS (
        SELECT
          LOWER(b.account_address) AS owner,
          SUM(
            COALESCE(
              (
                SELECT MAX(
                  CAST(
                    CASE
                      WHEN json_valid(t.metadata) = 1
                       AND json_type(attr.value, '$.value') IN ('text', 'integer', 'real')
                        THEN json_extract(attr.value, '$.value')
                      ELSE 0
                    END AS REAL
                  )
                )
                FROM json_each(
                  CASE
                    WHEN json_valid(t.metadata) = 1 THEN t.metadata
                    ELSE '{"attributes":[]}'
                  END, '$.attributes'
                ) attr
                WHERE LOWER(json_extract(attr.value, '$.trait_type')) LIKE '%power%'
                  AND json_extract(attr.value, '$.trait_type') IS NOT NULL
                  AND json_extract(attr.value, '$.value') IS NOT NULL
              ), 0
            )
          ) AS total_power,
          SUM(
            COALESCE(
              (
                SELECT MAX(
                  CAST(
                    CASE
                      WHEN json_valid(t.metadata) = 1
                       AND json_type(attr.value, '$.value') IN ('text', 'integer', 'real')
                        THEN json_extract(attr.value, '$.value')
                      ELSE 0
                    END AS REAL
                  )
                )
                FROM json_each(
                  CASE
                    WHEN json_valid(t.metadata) = 1 THEN t.metadata
                    ELSE '{"attributes":[]}'
                  END, '$.attributes'
                ) attr
                WHERE LOWER(json_extract(attr.value, '$.trait_type')) = 'health'
                  AND json_extract(attr.value, '$.trait_type') IS NOT NULL
                  AND json_extract(attr.value, '$.value') IS NOT NULL
              ), 0
            )
          ) AS total_health
        FROM tokens t
        JOIN token_balances b
          ON t.id = b.token_id
         AND t.contract_address = b.contract_address
        WHERE t.contract_address = '${CONTRACT_ADDRESS}'
          AND b.balance > '${ZERO_BALANCE}'
          AND b.account_address IS NOT NULL
          AND json_valid(t.metadata) = 1
        GROUP BY LOWER(b.account_address)
      ),
      power_ranked AS (
        SELECT
          owner,
          total_power,
          RANK() OVER (ORDER BY total_power DESC) AS power_rank
        FROM owner_stats
      ),
      health_ranked AS (
        SELECT
          owner,
          total_health,
          RANK() OVER (ORDER BY total_health DESC) AS health_rank
        FROM owner_stats
      )
      SELECT
        pr.power_rank,
        pr.total_power,
        hr.health_rank,
        hr.total_health,
        (SELECT COUNT(DISTINCT owner) FROM owner_stats) AS total_owners
      FROM power_ranked pr
      JOIN health_ranked hr ON pr.owner = hr.owner
      WHERE pr.owner IN (${addressList})
      LIMIT 1;
    `;

    type CombinedRankRow = {
      power_rank?: number | string | null;
      total_power?: number | string | null;
      health_rank?: number | string | null;
      total_health?: number | string | null;
      total_owners?: number | string | null;
    };

    const rows = await runBeastSql<CombinedRankRow[]>(query, "fetchBeastCombinedRanks");

    if (!rows || rows.length === 0) {
      return {
        powerRank: { rank: null, totalPower: 0, totalOwners: 0 },
        healthRank: { rank: null, totalHealth: 0, totalOwners: 0 },
      };
    }

    const [row] = rows;

    const parsedPowerRank = row?.power_rank != null ? Number(row.power_rank) : null;
    const powerRank = Number.isFinite(parsedPowerRank ?? NaN) ? parsedPowerRank : null;

    const parsedHealthRank = row?.health_rank != null ? Number(row.health_rank) : null;
    const healthRank = Number.isFinite(parsedHealthRank ?? NaN) ? parsedHealthRank : null;

    const rawTotalPower = row?.total_power;
    const totalPower =
      typeof rawTotalPower === "number"
        ? rawTotalPower
        : Number(rawTotalPower ?? 0);

    const rawTotalHealth = row?.total_health;
    const totalHealth =
      typeof rawTotalHealth === "number"
        ? rawTotalHealth
        : Number(rawTotalHealth ?? 0);

    const rawOwners = row?.total_owners;
    const totalOwners =
      typeof rawOwners === "number" ? rawOwners : Number(rawOwners ?? 0);

    return {
      powerRank: {
        rank: powerRank,
        totalPower: Number.isFinite(totalPower) ? totalPower : 0,
        totalOwners: Number.isFinite(totalOwners) ? totalOwners : 0,
      },
      healthRank: {
        rank: healthRank,
        totalHealth: Number.isFinite(totalHealth) ? totalHealth : 0,
        totalOwners: Number.isFinite(totalOwners) ? totalOwners : 0,
      },
    };
  });
}

export async function fetchBeastHealthRank(
  ownerAddress: string
): Promise<BeastHealthRank | null> {
  const normalised = normaliseStarknetAddress(ownerAddress);
  if (!normalised) return null;

  return apiCache.get("beast-health-rank", { address: normalised }, async () => {
    const variants = new Set<string>();
    variants.add(normalised.toLowerCase());
    if (normalised.startsWith("0x")) {
      const padded = `0x${normalised.slice(2).padStart(64, "0")}`;
      variants.add(padded.toLowerCase());
    }

    if (variants.size === 0) return null;

    const addressList = Array.from(variants)
      .map((address) => `'${address.replace(/'/g, "''")}'`)
      .join(", ");

    const query = `
      WITH owner_healths AS (
        SELECT
          LOWER(b.account_address) AS owner,
          COALESCE(
            (
              SELECT MAX(
                CAST(
                  CASE
                    WHEN json_valid(t.metadata) = 1
                     AND json_type(attr.value, '$.value') IN ('text', 'integer', 'real')
                      THEN json_extract(attr.value, '$.value')
                    ELSE 0
                  END AS REAL
                )
              )
              FROM json_each(
                CASE
                  WHEN json_valid(t.metadata) = 1 THEN t.metadata
                  ELSE '{"attributes":[]}'
                END, '$.attributes'
              ) attr
              WHERE LOWER(json_extract(attr.value, '$.trait_type')) = 'health'
                AND json_extract(attr.value, '$.trait_type') IS NOT NULL
                AND json_extract(attr.value, '$.value') IS NOT NULL
            ),
            0
          ) AS health
        FROM tokens t
        JOIN token_balances b
          ON t.id = b.token_id
         AND t.contract_address = b.contract_address
        WHERE t.contract_address = '${CONTRACT_ADDRESS}'
          AND b.balance > '${ZERO_BALANCE}'
          AND b.account_address IS NOT NULL
      ),
      owner_totals AS (
        SELECT
          owner,
          SUM(health) AS total_health
        FROM owner_healths
        GROUP BY owner
      ),
      ranked AS (
        SELECT
          owner,
          total_health,
          RANK() OVER (ORDER BY total_health DESC) AS rank
        FROM owner_totals
      )
      SELECT
        rank,
        total_health,
        (SELECT COUNT(*) FROM owner_totals) AS total_owners
      FROM ranked
      WHERE owner IN (${addressList})
      ORDER BY rank ASC
      LIMIT 1;
    `;

    type RankRow = {
      rank?: number | string | null;
      total_health?: number | string | null;
      total_owners?: number | string | null;
    };

    const rows = await runBeastSql<RankRow[]>(query, "fetchBeastHealthRank");
    if (!rows || rows.length === 0) {
      return { rank: null, totalHealth: 0, totalOwners: 0 };
    }

    const [row] = rows;

    const parsedRank = row?.rank != null ? Number(row.rank) : null;
    const rank = Number.isFinite(parsedRank ?? NaN) ? parsedRank : null;

    const rawTotalHealth = row?.total_health;
    const totalHealth =
      typeof rawTotalHealth === "number"
        ? rawTotalHealth
        : Number(rawTotalHealth ?? 0);

    const rawOwners = row?.total_owners;
    const totalOwners =
      typeof rawOwners === "number" ? rawOwners : Number(rawOwners ?? 0);

    return {
      rank,
      totalHealth: Number.isFinite(totalHealth) ? totalHealth : 0,
      totalOwners: Number.isFinite(totalOwners) ? totalOwners : 0,
    };
  });
}

export async function fetchPowerRankLeaderboard({
  limit = 10,
  offset = 0,
}: FetchLeaderboardOptions = {}): Promise<PowerRankLeaderboard> {
  return apiCache.get("power-rank-leaderboard", { limit, offset }, async () => {
    const query = `
      WITH owner_powers AS (
        SELECT
          LOWER(b.account_address) as owner,
          SUM(
            COALESCE(
              (
                SELECT MAX(
                  CAST(
                    CASE
                      WHEN json_type(attr.value, '$.value') IN ('text', 'integer', 'real')
                        THEN json_extract(attr.value, '$.value')
                      ELSE NULL
                    END AS REAL
                  )
                )
                FROM json_each(
                  CASE
                    WHEN json_valid(t.metadata) = 1 THEN t.metadata
                    ELSE '{"attributes":[]}'
                  END,
                  '$.attributes'
                ) attr
                WHERE LOWER(json_extract(attr.value, '$.trait_type')) LIKE '%power%'
                  AND json_extract(attr.value, '$.trait_type') IS NOT NULL
                  AND json_extract(attr.value, '$.value') IS NOT NULL
              ), 0
            )
          ) as total_power
        FROM tokens t
        JOIN token_balances b
          ON t.id = b.token_id
          AND t.contract_address = b.contract_address
        WHERE t.contract_address = '${CONTRACT_ADDRESS}'
          AND b.balance > '${ZERO_BALANCE}'
          AND json_valid(t.metadata) = 1
          AND b.account_address IS NOT NULL
          AND b.account_address != ''
        GROUP BY LOWER(b.account_address)
        HAVING total_power > 0
      )
      SELECT
        ROW_NUMBER() OVER (ORDER BY total_power DESC) as rank,
        owner,
        total_power as value
      FROM owner_powers
      ORDER BY total_power DESC
      LIMIT ${limit} OFFSET ${offset}
    `;

    type PowerRankRow = {
      rank: number;
      owner: string;
      value: number;
    };

    const rows = await runBeastSql<PowerRankRow[]>(query, "fetchPowerRankLeaderboard");
    return rows.map(row => ({
      rank: row.rank,
      owner: row.owner,
      username: null, // Will be resolved by username service
      value: row.value,
    }));
  });
}

export async function fetchBeastCollectionLeaderboard({
  limit = 10,
  offset = 0,
}: FetchLeaderboardOptions = {}): Promise<BeastCollectionLeaderboard> {
  return apiCache.get("beast-collection-leaderboard", { limit, offset }, async () => {
    const query = `
      WITH owner_counts AS (
        SELECT
          LOWER(b.account_address) as owner,
          COUNT(*) as beast_count
        FROM tokens t
        JOIN token_balances b
          ON t.id = b.token_id
          AND t.contract_address = b.contract_address
        WHERE t.contract_address = '${CONTRACT_ADDRESS}'
          AND b.balance > '${ZERO_BALANCE}'
          AND json_valid(t.metadata) = 1
          AND b.account_address IS NOT NULL
          AND b.account_address != ''
        GROUP BY LOWER(b.account_address)
      )
      SELECT
        ROW_NUMBER() OVER (ORDER BY beast_count DESC) as rank,
        owner,
        beast_count as value
      FROM owner_counts
      ORDER BY beast_count DESC
      LIMIT ${limit} OFFSET ${offset}
    `;

    type BeastCountRow = {
      rank: number;
      owner: string;
      value: number;
    };

    const rows = await runBeastSql<BeastCountRow[]>(query, "fetchBeastCollectionLeaderboard");
    return rows.map(row => ({
      rank: row.rank,
      owner: row.owner,
      username: null, // Will be resolved by username service
      value: row.value,
    }));
  });
}

function buildBeastRarityWhereClause(category: BeastRarityLeaderboardCategory): string {
  switch (category) {
    case "all":
      return "1 = 1";
    case "animatedShiny":
      return "is_shiny = 1 AND is_animated = 1";
    case "shiny":
      return "is_shiny = 1";
    case "animated":
      return "is_animated = 1";
    case "standard":
      return "is_shiny = 0 AND is_animated = 0";
    default:
      return "1 = 0";
  }
}

export async function fetchBeastRarityBeastLeaderboard({
  category,
  limit = 10,
  offset = 0,
  ascending = false,
}: FetchLeaderboardOptions & { category: BeastRarityLeaderboardCategory; ascending?: boolean }): Promise<BeastNameLeaderboardEntry[]> {
  const safeCategory = category ?? "all";

  if (safeCategory === "all") {
    return fetchMostCollectedBeastLeaderboard({ limit, offset, ascending });
  }

  return apiCache.get(
    "beast-rarity-leaderboard",
    { category: safeCategory, limit, offset, ascending },
    async () => {
      const whereClause = buildBeastRarityWhereClause(safeCategory);
      if (!whereClause || whereClause === "1 = 0") {
        return [];
      }

      const orderDirection = ascending ? "ASC" : "DESC";

      const query = `
        WITH all_token_attrs AS (
          SELECT
            t.id,
            json_extract(attr.value, '$.trait_type') AS trait,
            json_extract(attr.value, '$.value') AS value
          FROM tokens t
          JOIN json_each(
            CASE
              WHEN json_valid(t.metadata) = 1 THEN t.metadata
              ELSE '{"attributes":[]}'
            END,
            '$.attributes'
          ) attr
          WHERE t.contract_address = '${CONTRACT_ADDRESS}'
            AND json_valid(t.metadata) = 1
            AND json_extract(attr.value, '$.trait_type') IS NOT NULL
            AND json_extract(attr.value, '$.value') IS NOT NULL
        ),
        all_beasts AS (
          SELECT DISTINCT
            MAX(CASE WHEN LOWER(trait) = 'beast' THEN value END) AS beast_name
          FROM all_token_attrs
          WHERE LOWER(trait) = 'beast'
          GROUP BY id
        ),
        owned_token_attrs AS (
          SELECT
            t.id,
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
            AND b.account_address IS NOT NULL
            AND b.account_address != ''
            AND LOWER(b.account_address) != '${EXCLUDED_OWNER_ADDRESS.toLowerCase()}'
        ),
        normalized AS (
          SELECT
            id,
            MAX(CASE WHEN LOWER(trait) LIKE 'shiny%' AND value IN ('1','true','True','TRUE') THEN 1 ELSE 0 END) AS is_shiny,
            MAX(CASE WHEN LOWER(trait) LIKE 'animated%' AND value IN ('1','true','True','TRUE') THEN 1 ELSE 0 END) AS is_animated,
            MAX(CASE WHEN LOWER(trait) = 'beast' THEN value END) AS beast_name
          FROM owned_token_attrs
          GROUP BY id
        ),
        filtered AS (
          SELECT
            beast_name
          FROM normalized
          WHERE beast_name IS NOT NULL
            AND ${whereClause}
        ),
        counts AS (
          SELECT
            ab.beast_name,
            COUNT(f.beast_name) AS total
          FROM all_beasts ab
          LEFT JOIN filtered f ON ab.beast_name = f.beast_name
          WHERE ab.beast_name IS NOT NULL
          GROUP BY ab.beast_name
        )
        SELECT
          ROW_NUMBER() OVER (ORDER BY total ${orderDirection}, beast_name ASC) AS rank,
          beast_name,
          total AS value
        FROM counts
        ORDER BY total ${orderDirection}, beast_name ASC
        LIMIT ${limit} OFFSET ${offset};
      `;

      type BeastRarityRow = {
        rank: number;
        beast_name: string;
        value: number;
      };

      const rows = await runBeastSql<BeastRarityRow[]>(query, "fetchBeastRarityBeastLeaderboard");
      return rows.map((row) => ({
        rank: row.rank,
        beast_name: row.beast_name,
        value: row.value,
      }));
    }
  );
}

export async function fetchMostCollectedBeastLeaderboard({
  limit = 10,
  offset = 0,
  ascending = false,
}: FetchLeaderboardOptions & { ascending?: boolean } = {}): Promise<BeastNameLeaderboardEntry[]> {
  return apiCache.get("most-collected-beast-leaderboard", { limit, offset, ascending }, async () => {
    const query = `
      WITH beast_counts AS (
        SELECT
          json_extract(attr.value, '$.value') as beast_name,
          COUNT(*) as beast_count
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
          AND LOWER(json_extract(attr.value, '$.trait_type')) = 'beast'
          AND json_extract(attr.value, '$.value') IS NOT NULL
          AND json_extract(attr.value, '$.value') != ''
        GROUP BY json_extract(attr.value, '$.value')
      )
      SELECT
        ROW_NUMBER() OVER (ORDER BY beast_count ${ascending ? 'ASC' : 'DESC'}) as rank,
        beast_name,
        beast_count as value
      FROM beast_counts
      ORDER BY beast_count ${ascending ? 'ASC' : 'DESC'}
      LIMIT ${limit} OFFSET ${offset}
    `;

    type BeastNameCountRow = {
      rank: number;
      beast_name: string;
      value: number;
    };

    const rows = await runBeastSql<BeastNameCountRow[]>(query, "fetchMostCollectedBeastLeaderboard");
    return rows.map(row => ({
      rank: row.rank,
      beast_name: row.beast_name,
      value: row.value,
    }));
  });
}

export async function fetchBeastOfTheDayLeaderboard({
  limit = 10,
  offset = 0,
}: FetchLeaderboardOptions = {}): Promise<Array<{
  rank: number;
  beast: Beast;
  owner: string;
  rarity_score: number;
  power: number;
  beast_rank: number;
  last_death: number;
}>> {
  return apiCache.get("beast-of-the-day-leaderboard", { limit, offset }, async () => {
    // Calculate 24 hours ago timestamp
    const twentyFourHoursAgo = Math.floor(Date.now() / 1000) - (24 * 60 * 60);

    const query = `
      WITH beast_data AS (
        SELECT
          t.id,
          t.metadata,
          LOWER(b.account_address) as owner,
          -- Extract attributes
          (SELECT json_extract(attr.value, '$.value')
           FROM json_each(t.metadata, '$.attributes') attr
           WHERE LOWER(json_extract(attr.value, '$.trait_type')) = 'beast') as beast_name,
          (SELECT CAST(json_extract(attr.value, '$.value') AS INTEGER)
           FROM json_each(t.metadata, '$.attributes') attr
           WHERE LOWER(json_extract(attr.value, '$.trait_type')) = 'last death timestamp') as last_death,
          (SELECT CAST(json_extract(attr.value, '$.value') AS REAL)
           FROM json_each(t.metadata, '$.attributes') attr
           WHERE LOWER(json_extract(attr.value, '$.trait_type')) LIKE '%power%') as power,
          (SELECT CAST(json_extract(attr.value, '$.value') AS INTEGER)
           FROM json_each(t.metadata, '$.attributes') attr
           WHERE LOWER(json_extract(attr.value, '$.trait_type')) = 'rank') as beast_rank,
          (SELECT json_extract(attr.value, '$.value')
           FROM json_each(t.metadata, '$.attributes') attr
           WHERE LOWER(json_extract(attr.value, '$.trait_type')) = 'animated') as animated,
          (SELECT json_extract(attr.value, '$.value')
           FROM json_each(t.metadata, '$.attributes') attr
           WHERE LOWER(json_extract(attr.value, '$.trait_type')) = 'shiny') as shiny
        FROM tokens t
        JOIN token_balances b
          ON t.id = b.token_id
          AND t.contract_address = b.contract_address
        WHERE t.contract_address = '${CONTRACT_ADDRESS}'
          AND b.balance > '${ZERO_BALANCE}'
          AND json_valid(t.metadata) = 1
          AND b.account_address IS NOT NULL
          AND b.account_address != ''
      ),
      recent_deaths AS (
        SELECT
          *,
          -- Calculate rarity score: Shiny Animated = 3, Shiny = 2, Animated = 2, Standard = 1
          CASE
            WHEN (animated = '1' OR animated = 1) AND (shiny = '1' OR shiny = 1) THEN 3
            WHEN (shiny = '1' OR shiny = 1) THEN 2
            WHEN (animated = '1' OR animated = 1) THEN 2
            ELSE 1
          END as rarity_score
        FROM beast_data
        WHERE last_death IS NOT NULL
          AND last_death >= ${twentyFourHoursAgo}
          AND power IS NOT NULL
          AND beast_rank IS NOT NULL
      )
      SELECT
        ROW_NUMBER() OVER (
          ORDER BY
            rarity_score DESC,
            power DESC,
            beast_rank ASC
        ) as rank,
        id,
        metadata,
        owner,
        rarity_score,
        COALESCE(power, 0) as power,
        COALESCE(beast_rank, 999999) as beast_rank,
        last_death
      FROM recent_deaths
      ORDER BY
        rarity_score DESC,
        power DESC,
        beast_rank ASC
      LIMIT ${limit} OFFSET ${offset}
    `;

    type BeastOfTheDayRow = {
      rank: number;
      id: string;
      metadata: string;
      owner: string;
      rarity_score: number;
      power: number;
      beast_rank: number;
      last_death: number;
    };

    const rows = await runBeastSql<BeastOfTheDayRow[]>(query, "fetchBeastOfTheDayLeaderboard");

    return rows.map(row => {
      // Parse the beast data using existing helper
      const beastRow = {
        id: row.id,
        metadata: row.metadata,
        account_address: row.owner,
        contract_address: CONTRACT_ADDRESS,
        token_id: row.id,
        balance: "1",
        total_count: 1
      };

      const beast = mapBeastRow(beastRow);

      return {
        rank: row.rank,
        beast,
        owner: row.owner,
        rarity_score: row.rarity_score,
        power: row.power,
        beast_rank: row.beast_rank,
        last_death: row.last_death,
      };
    });
  });
}

export async function fetchBeastSlayerLeaderboard({
  limit = 10,
  offset = 0,
}: FetchLeaderboardOptions = {}): Promise<BeastSlayerEntry[]> {
  return apiCache.get("beast-slayer-leaderboard", { limit, offset }, async () => {
    const query = `
      WITH kills AS (
        SELECT
          t.id,
          json_extract(t.metadata, '$.name') AS beast_name,
          LOWER(b.account_address) AS owner,
          MAX(
            CAST(
              CASE
                WHEN json_type(attr.value, '$.value') IN ('integer', 'real', 'text')
                  THEN json_extract(attr.value, '$.value')
                ELSE NULL
              END AS REAL
            )
          ) AS kills
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
          AND LOWER(json_extract(attr.value, '$.trait_type')) LIKE '%adventurer%'
          AND LOWER(json_extract(attr.value, '$.trait_type')) LIKE '%kill%'
          AND LOWER(b.account_address) != '${EXCLUDED_OWNER_ADDRESS.toLowerCase()}'
        GROUP BY t.id, beast_name, owner
      ),
      ranked AS (
        SELECT
          id,
          COALESCE(beast_name, '') AS beast_name,
          owner,
          CAST(kills AS INTEGER) AS kills
        FROM kills
        WHERE kills IS NOT NULL
          AND kills > 0
      )
      SELECT
        ROW_NUMBER() OVER (ORDER BY kills DESC, id ASC) AS rank,
        id,
        beast_name,
        owner,
        kills
      FROM ranked
      ORDER BY kills DESC, id ASC
      LIMIT ${limit} OFFSET ${offset};
    `;

    type SlayerRow = {
      rank: number;
      id: string | number;
      beast_name: string | null;
      owner: string | null;
      kills: number | null;
    };

    const rows = await runBeastSql<SlayerRow[]>(query, "fetchBeastSlayerLeaderboard");
    return rows.map((row) => ({
      rank: row.rank,
      beastId: String(row.id),
      beastName: row.beast_name && row.beast_name.trim().length > 0 ? row.beast_name : `Beast #${row.id}`,
      owner: row.owner ?? null,
      kills: Number.isFinite(row.kills ?? NaN) ? Number(row.kills) : 0,
    }));
  });
}

export async function fetchOwnerBeastStats(
  ownerAddress: string
): Promise<OwnerBeastStats> {
  const normalised = normaliseStarknetAddress(ownerAddress);
  if (!normalised) {
    return {
      totalBeasts: 0,
      totalPower: 0,
      uniqueBeastTypes: 0,
      uniqueTiers: 0,
      maxPower: 0,
    };
  }

  return apiCache.get("owner-beast-stats", { address: normalised }, async () => {
    const query = buildOwnerBeastStatsQuery(ownerAddress);

    type StatsRow = {
      total_beasts: number;
      total_power: number;
      unique_beast_types: number;
      unique_tiers: number;
      max_power: number;
    };

    const rows = await runBeastSql<StatsRow[]>(query, "fetchOwnerBeastStats");

    if (!rows || rows.length === 0) {
      return {
        totalBeasts: 0,
        totalPower: 0,
        uniqueBeastTypes: 0,
        uniqueTiers: 0,
        maxPower: 0,
      };
    }

    const row = rows[0];

    return {
      totalBeasts: Number(row.total_beasts) || 0,
      totalPower: Number(row.total_power) || 0,
      uniqueBeastTypes: Number(row.unique_beast_types) || 0,
      uniqueTiers: Number(row.unique_tiers) || 0,
      maxPower: Number(row.max_power) || 0,
    };
  });
}

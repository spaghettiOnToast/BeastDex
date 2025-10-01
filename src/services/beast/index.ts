import { mapBeastRow, type BeastRow } from "./helpers";
import {
  buildAttributeFiltersQuery,
  buildBeastsQuery,
  buildBeastByIdQuery,
} from "./queries";
import { runBeastSql } from "./sqlClient";
import { normaliseStarknetAddress } from "../../utils/address";
import { CONTRACT_ADDRESS, ZERO_BALANCE } from "./constants";
import type {
  Beast,
  BeastAttributeFilters,
  BeastPowerRank,
  FetchBeastsOptions,
  FetchLeaderboardOptions,
  PowerRankLeaderboard,
  BeastCollectionLeaderboard,
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
  BeastStats,
  LeaderboardEntry,
  PowerRankLeaderboard,
  BeastCollectionLeaderboard,
  FetchLeaderboardOptions,
} from "./types";

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

export async function fetchAdventurerDeaths(
  ownerAddress: string
): Promise<number> {
  const normalised = normaliseStarknetAddress(ownerAddress);
  if (!normalised) {
    return 0;
  }

  return apiCache.get("adventurer-deaths", { address: normalised }, async () => {
    const escapedOwner = normalised.replace(/'/g, "''");
    const paddedOwner = normalised.startsWith("0x")
      ? `0x${normalised.slice(2).padStart(64, "0")}`
      : normalised;
    const escapedPaddedOwner = paddedOwner.replace(/'/g, "''");

    const query = `
      SELECT COUNT(*) AS kills
      FROM "relayer_0_0_1-TokenMetadataUpdate" tm
      LEFT JOIN "relayer_0_0_1-OwnersUpdate" o ON o.token_id = tm.id
      LEFT JOIN "relayer_0_0_1-GameRegistryUpdate" gr ON gr.id = tm.game_id
      LEFT JOIN "relayer_0_0_1-MinterRegistryUpdate" mr ON mr.id = tm.minted_by
      WHERE gr.contract_address IN ('0x05e2dfbdc3c193de629e5beb116083b06bd944c1608c9c793351d5792ba29863')
        AND mr.minter_address = '0x00a67ef20b61a9846e1c82b411175e6ab167ea9f8632bd6c2091823c3629ec42'
        AND game_over = 1
        AND (
          o.owner = '${escapedOwner}'
          OR o.owner = '${escapedPaddedOwner}'
          OR LOWER(o.owner) = '${escapedOwner.toLowerCase()}'
          OR LOWER(o.owner) = '${escapedPaddedOwner.toLowerCase()}'
        )
    `;

    const rows = await runBeastSql<Array<{ kills?: number }>>(
      query,
      "fetchAdventurerDeaths"
    );
    if (!rows || rows.length === 0) {
      return 0;
    }
    const rawKills = rows[0]?.kills;
    const kills = typeof rawKills === "number" ? rawKills : Number(rawKills ?? 0);
    return Number.isFinite(kills) ? kills : 0;
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

export async function fetchMostCollectedBeastLeaderboard({
  limit = 10,
  offset = 0,
}: FetchLeaderboardOptions = {}): Promise<Array<{
  rank: number;
  beast_name: string;
  value: number;
}>> {
  return apiCache.get("most-collected-beast-leaderboard", { limit, offset }, async () => {
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
        ROW_NUMBER() OVER (ORDER BY beast_count DESC) as rank,
        beast_name,
        beast_count as value
      FROM beast_counts
      ORDER BY beast_count DESC
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
          -- Calculate rarity score: Shiny Animated = 4, Shiny = 3, Animated = 2, Standard = 1
          CASE
            WHEN (animated = '1' OR animated = 1) AND (shiny = '1' OR shiny = 1) THEN 4
            WHEN (shiny = '1' OR shiny = 1) THEN 3
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


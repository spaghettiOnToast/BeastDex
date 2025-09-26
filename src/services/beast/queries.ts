import { normaliseStarknetAddresses } from "../../utils/address";
import { CONTRACT_ADDRESS, ZERO_BALANCE } from "./constants";
import type { AttributeFilterInput } from "./types";

type BuildBeastsQueryOptions = {
  limit: number;
  search?: string;
  attributeFilters?: AttributeFilterInput;
  ownerAddresses?: string[];
  page?: number;
  sort?: "default" | "beast" | "tier" | "health" | "rank" | "last-death";
};

function escapeSqlLiteral(value: string) {
  return value.replace(/'/g, "''");
}

const POWER_SELECT_FRAGMENT = `(
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
      ) AS power`;

// Optimized power calculation - only compute when actually needed
function buildOptimizedPowerFragment(needsPower: boolean) {
  if (!needsPower) {
    return "NULL as power";
  }
  return POWER_SELECT_FRAGMENT;
}

function buildAttributeFiltersClause(
  filters: AttributeFilterInput | undefined
) {
  if (!filters) return "";

  const clauses = Object.entries(filters)
    .filter(([, values]) => Array.isArray(values) && values.length > 0)
    .map(([trait, values]) => {
      const escapedTrait = escapeSqlLiteral(trait);
      const escapedValues = values
        .map((value) => `'${escapeSqlLiteral(String(value))}'`)
        .join(", ");

      return `AND EXISTS (
        SELECT 1
        FROM json_each(
          CASE
            WHEN json_valid(t.metadata) = 1 THEN t.metadata
            ELSE '{"attributes":[]}'
          END,
          '$.attributes'
        ) attr
        WHERE json_extract(attr.value, '$.trait_type') = '${escapedTrait}'
          AND json_extract(attr.value, '$.value') IN (${escapedValues})
          AND json_extract(attr.value, '$.trait_type') IS NOT NULL
          AND json_extract(attr.value, '$.value') IS NOT NULL
      )`;
    });

  if (clauses.length === 0) {
    return "";
  }

  return `\n${clauses.join("\n")}`;
}

function buildSearchClause(search?: string) {
  if (!search) return "";
  const trimmed = search.trim();
  if (!trimmed) return "";

  const numericSearch = Number.parseInt(trimmed, 10);
  const escapedLower = escapeSqlLiteral(trimmed.toLowerCase());

  const conditions = [
    `LOWER(json_extract(t.metadata, '$.name')) LIKE '%${escapedLower}%'`,
    `LOWER(b.account_address) LIKE '%${escapedLower}%'`,
  ];

  if (!Number.isNaN(numericSearch) && trimmed === String(numericSearch)) {
    conditions.unshift(
      `CAST(t.id AS TEXT) LIKE '%${escapeSqlLiteral(String(numericSearch))}%'`
    );
  }

  return `\n        AND (\n          ${conditions.join(
    "\n          OR "
  )}\n        )`;
}

function buildOwnerClause(addresses?: string[]) {
  if (!Array.isArray(addresses) || addresses.length === 0) {
    return "";
  }

  const canonical = normaliseStarknetAddresses(addresses).map(
    (address) => `'${escapeSqlLiteral(address)}'`
  );

  if (canonical.length === 0) {
    return "";
  }

  return `\n        AND LOWER(b.account_address) IN (${canonical.join(", ")})`;
}

export function buildBeastsQuery({
  limit,
  search,
  attributeFilters,
  ownerAddresses,
  page = 1,
  sort = "default",
}: BuildBeastsQueryOptions) {
  const limitClause = Number.isFinite(limit) && limit > 0 ? limit : 20;
  const safePage = Number.isFinite(page) && page > 0 ? Math.floor(page) : 1;
  const offset = (safePage - 1) * limitClause;
  const attributeClauses = buildAttributeFiltersClause(attributeFilters);
  const searchClause = buildSearchClause(search);
  const ownerClause = buildOwnerClause(ownerAddresses);
  const beastJoin =
    sort === "beast"
      ? `LEFT JOIN json_each(
          CASE
            WHEN json_valid(t.metadata) = 1 THEN t.metadata
            ELSE '{"attributes":[]}'
          END,
          '$.attributes'
        ) beast_attr
         ON json_valid(t.metadata) = 1
        AND json_extract(beast_attr.value, '$.trait_type') = 'Beast'
        AND json_extract(beast_attr.value, '$.trait_type') IS NOT NULL
        AND json_extract(beast_attr.value, '$.value') IS NOT NULL`
      : "";

  const tierJoin =
    sort === "tier"
      ? `LEFT JOIN json_each(
          CASE
            WHEN json_valid(t.metadata) = 1 THEN t.metadata
            ELSE '{"attributes":[]}'
          END,
          '$.attributes'
        ) tier_attr
         ON json_valid(t.metadata) = 1
        AND json_extract(tier_attr.value, '$.trait_type') = 'Tier'
        AND json_extract(tier_attr.value, '$.trait_type') IS NOT NULL
        AND json_extract(tier_attr.value, '$.value') IS NOT NULL`
      : "";

  const healthJoin =
    sort === "health"
      ? `LEFT JOIN json_each(
          CASE
            WHEN json_valid(t.metadata) = 1 THEN t.metadata
            ELSE '{"attributes":[]}'
          END,
          '$.attributes'
        ) health_attr
         ON json_valid(t.metadata) = 1
        AND json_extract(health_attr.value, '$.trait_type') = 'Health'
        AND json_extract(health_attr.value, '$.trait_type') IS NOT NULL
        AND json_extract(health_attr.value, '$.value') IS NOT NULL`
      : "";

  const rankJoin =
    sort === "rank"
      ? `LEFT JOIN json_each(
          CASE
            WHEN json_valid(t.metadata) = 1 THEN t.metadata
            ELSE '{"attributes":[]}'
          END,
          '$.attributes'
        ) rank_attr
         ON json_valid(t.metadata) = 1
        AND json_extract(rank_attr.value, '$.trait_type') = 'Rank'
        AND json_extract(rank_attr.value, '$.trait_type') IS NOT NULL
        AND json_extract(rank_attr.value, '$.value') IS NOT NULL`
      : "";

  const lastDeathJoin =
    sort === "last-death"
      ? `LEFT JOIN json_each(
          CASE
            WHEN json_valid(t.metadata) = 1 THEN t.metadata
            ELSE '{"attributes":[]}'
          END,
          '$.attributes'
        ) death_attr
         ON json_valid(t.metadata) = 1
        AND LOWER(json_extract(death_attr.value, '$.trait_type')) = 'last death timestamp'
        AND json_extract(death_attr.value, '$.trait_type') IS NOT NULL
        AND json_extract(death_attr.value, '$.value') IS NOT NULL
        AND json_extract(death_attr.value, '$.value') != '0'`
      : "";

  const beastSelect =
    sort === "beast"
      ? ", json_extract(beast_attr.value, '$.value') AS beast_value"
      : ", NULL AS beast_value";

  const tierSelect =
    sort === "tier"
      ? ", CAST(json_extract(tier_attr.value, '$.value') AS INTEGER) AS tier_value"
      : ", NULL AS tier_value";

  const healthSelect =
    sort === "health"
      ? ", CAST(json_extract(health_attr.value, '$.value') AS INTEGER) AS health_value"
      : ", NULL AS health_value";

  const rankSelect =
    sort === "rank"
      ? ", CAST(json_extract(rank_attr.value, '$.value') AS INTEGER) AS rank_value"
      : ", NULL AS rank_value";

  const lastDeathSelect =
    sort === "last-death"
      ? ", CAST(json_extract(death_attr.value, '$.value') AS INTEGER) AS death_timestamp_value"
      : ", NULL AS death_timestamp_value";
  // Only compute power when sorting by power (default sort)
  const needsPower = sort === "default";
  const orderClause =
    sort === "beast"
      ? "ORDER BY COALESCE(beast_value, '') COLLATE NOCASE ASC, CAST(id AS INTEGER) ASC"
      : sort === "tier"
        ? "ORDER BY COALESCE(tier_value, 999) ASC, CAST(id AS INTEGER) ASC"
        : sort === "health"
          ? "ORDER BY COALESCE(health_value, 0) DESC, CAST(id AS INTEGER) ASC"
          : sort === "rank"
            ? "ORDER BY COALESCE(rank_value, 999999) ASC, CAST(id AS INTEGER) ASC"
            : sort === "last-death"
              ? "ORDER BY COALESCE(death_timestamp_value, 0) DESC, CAST(id AS INTEGER) ASC"
              : needsPower
                ? "ORDER BY power DESC, CAST(id AS INTEGER) ASC"
                : "ORDER BY CAST(id AS INTEGER) ASC";

  return `
    WITH filtered_tokens AS (
      SELECT
        t.id,
        t.metadata,
        b.account_address,
        ${buildOptimizedPowerFragment(needsPower)}
        ${beastSelect}
        ${tierSelect}
        ${healthSelect}
        ${rankSelect}
        ${lastDeathSelect}
      FROM tokens t
      JOIN token_balances b
        ON t.id = b.token_id
      AND t.contract_address = b.contract_address
      ${beastJoin}
      ${tierJoin}
      ${healthJoin}
      ${rankJoin}
      ${lastDeathJoin}
          WHERE t.contract_address = '${CONTRACT_ADDRESS}'
            AND b.balance > '${ZERO_BALANCE}'
            AND json_valid(t.metadata) = 1 
            ${searchClause}
            ${attributeClauses}
            ${ownerClause}
    )
    , total AS (
      SELECT COUNT(*) AS total_count FROM filtered_tokens
    )
    , ordered_tokens AS (
      SELECT *
      FROM filtered_tokens
      ${orderClause}
      LIMIT ${limitClause}
      OFFSET ${offset}
    )
    SELECT
      ordered_tokens.id,
      ordered_tokens.metadata,
      ordered_tokens.account_address,
      ordered_tokens.power,
      total.total_count
    FROM ordered_tokens
    CROSS JOIN total;
  `;
}

export function buildAttributeFiltersQuery() {
  return `
    WITH scoped_tokens AS (
      SELECT t.metadata
      FROM tokens t
      WHERE t.contract_address = '${CONTRACT_ADDRESS}'
       AND json_valid(t.metadata) = 1
    )
    SELECT
      json_extract(attr.value, '$.trait_type') AS trait_type,
      json_group_array(DISTINCT json_extract(attr.value, '$.value')) AS values_json
    FROM scoped_tokens
    JOIN json_each(
      CASE
        WHEN json_valid(scoped_tokens.metadata) = 1 THEN scoped_tokens.metadata
        ELSE '{"attributes":[]}'
      END,
      '$.attributes'
    ) attr
    WHERE json_extract(attr.value, '$.trait_type') IS NOT NULL
      AND json_extract(attr.value, '$.value') IS NOT NULL
      AND json_extract(attr.value, '$.trait_type') != ''
      AND json_extract(attr.value, '$.value') != ''
    GROUP BY trait_type;
  `;
}

export function buildBeastByIdQuery(id: string, tokenHex?: string) {
  const trimmedId = id?.trim() ?? "";
  const hasId = trimmedId.length > 0;
  const escapedIdLower = hasId ? escapeSqlLiteral(trimmedId.toLowerCase()) : "";
  const normalisedHex = tokenHex?.toLowerCase();
  const escapedHex = normalisedHex ? escapeSqlLiteral(normalisedHex) : "";

  const idClause = hasId ? `LOWER(t.id) = '${escapedIdLower}'` : "";

  const hexClause = normalisedHex
    ? `LOWER(
          CASE
            WHEN instr(t.id, ':') > 0 THEN substr(t.id, instr(t.id, ':') + 1)
            ELSE t.id
          END
        ) = '${escapedHex}'`
    : "";

  const whereClauses = [idClause, hexClause].filter(
    (clause) => clause.length > 0
  );
  const filter = whereClauses.length > 0 ? whereClauses.join(" OR ") : "0";

  return `
    SELECT
      t.id,
      t.metadata,
      b.account_address,
      ${POWER_SELECT_FRAGMENT}
    FROM tokens t
    JOIN token_balances b
      ON t.id = b.token_id
     AND t.contract_address = b.contract_address
    WHERE t.contract_address = '${CONTRACT_ADDRESS}'
      AND b.balance > '${ZERO_BALANCE}'
       AND json_valid(t.metadata) = 1
      AND (${filter})
    LIMIT 1;
  `;
}

export function buildBeastStatsQuery() {
  return `
    SELECT
      COUNT(DISTINCT t.id) AS minted_count,
      COUNT(DISTINCT b.account_address) AS unique_owners
    FROM tokens t
    JOIN token_balances b
      ON t.id = b.token_id
     AND t.contract_address = b.contract_address
    WHERE t.contract_address = '${CONTRACT_ADDRESS}'
      AND b.balance > '${ZERO_BALANCE}';
  `;
}

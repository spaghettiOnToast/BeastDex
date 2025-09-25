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

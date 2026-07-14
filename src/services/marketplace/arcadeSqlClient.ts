/**
 * Arcade SQL Client
 *
 * SQL client configured for the torii-beastdex endpoint
 * Used for querying order status directly
 */

import { createSqlClient } from "../shared/sqlClient";

const ARCADE_SQL_ENDPOINT =
  (import.meta.env.VITE_ARCADE_TORII_SQL as string | undefined)?.trim() ||
  (import.meta.env.DEV
    ? "/arcade/sql"
    : "https://torii-production-7359.up.railway.app/sql");

export const runArcadeSql = createSqlClient({
  endpoint: ARCADE_SQL_ENDPOINT,
  label: "ToriiSQL",
  defaultOptions: {
    retries: 1, // Fewer retries for validation queries
    baseDelayMs: 500,
    timeoutMs: 10_000, // Shorter timeout for status checks
  },
});

/**
 * Batch check order statuses from torii-beastdex.
 * Returns a map of orderId -> isActive (status === 1)
 */
export async function batchCheckOrderStatuses(
  orderIds: string[]
): Promise<Map<string, boolean>> {
  const result = new Map<string, boolean>();

  if (orderIds.length === 0) return result;

  // Build SQL query to check statuses
  const idsString = orderIds.join(",");
  const query = `
    SELECT id, status
    FROM "ARCADE-Order"
    WHERE id IN (${idsString})
  `;

  try {
    const rows = await runArcadeSql<Array<{ id: string; status: string }>>(
      query,
      "batchCheckOrderStatuses"
    );

    // Map results: status 1 = active, anything else = inactive
    for (const row of rows) {
      const raw = String(row.status);
      const statusNum = raw.startsWith("0x")
        ? parseInt(raw, 16)
        : parseInt(raw, 10);
      result.set(String(row.id), statusNum === 1);
    }

    // Orders not found in arcade-main are assumed active (fail-open).
    // The contract check (Step 2) is the authoritative source.
    for (const id of orderIds) {
      if (!result.has(id)) {
        result.set(id, true);
      }
    }

    return result;
  } catch (error) {
    console.warn("[ArcadeSQL] Failed to batch check order statuses:", error);
    // On error, assume all are active (don't hide listings due to query failure)
    for (const id of orderIds) {
      result.set(id, true);
    }
    return result;
  }
}

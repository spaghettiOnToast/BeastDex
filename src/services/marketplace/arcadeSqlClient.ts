/**
 * Arcade SQL Client
 *
 * SQL client configured for the arcade-main Torii endpoint
 * Used for querying order status directly (bypassing pg-beasts sync lag)
 */

import { createSqlClient } from "../shared/sqlClient";

// Arcade-main SQL endpoint (same pattern as pg-beasts but different slot)
const ARCADE_SQL_ENDPOINT = import.meta.env.DEV
  ? "/arcade/sql" // Proxy in dev
  : "https://api.cartridge.gg/x/arcade-main/torii/sql";

export const runArcadeSql = createSqlClient({
  endpoint: ARCADE_SQL_ENDPOINT,
  label: "ArcadeSQL",
  defaultOptions: {
    retries: 1, // Fewer retries for validation queries
    baseDelayMs: 500,
    timeoutMs: 10_000, // Shorter timeout for status checks
  },
});

/**
 * Batch check order statuses directly from arcade-main
 * Returns a map of orderId -> isActive (status === 1)
 *
 * This bypasses pg-beasts sync lag by querying arcade-main directly
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
      const statusNum = row.status.startsWith("0x")
        ? parseInt(row.status, 16)
        : parseInt(row.status, 10);
      result.set(row.id, statusNum === 1);
    }

    // Any order not in results is assumed inactive (deleted/not found)
    for (const id of orderIds) {
      if (!result.has(id)) {
        result.set(id, false);
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

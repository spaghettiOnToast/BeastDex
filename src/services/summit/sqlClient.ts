/**
 * Summit SQL Client
 *
 * SQL client configured for the Summit Torii endpoint
 */

import { createSqlClient } from "../shared/sqlClient";
import { SUMMIT_TORII_SQL_ENDPOINT } from "./constants";

export const runSummitSql = createSqlClient({
  endpoint: SUMMIT_TORII_SQL_ENDPOINT,
  label: "Summit SQL",
  defaultOptions: {
    retries: 2,
    baseDelayMs: 1000,
    timeoutMs: 30_000,
  },
});

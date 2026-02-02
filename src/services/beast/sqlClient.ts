/**
 * Beast SQL Client
 *
 * SQL client configured for the pg-beasts Torii endpoint
 */

import { createSqlClient } from "../shared/sqlClient";
import { TORII_SQL_ENDPOINT } from "./constants";

export const runBeastSql = createSqlClient({
  endpoint: TORII_SQL_ENDPOINT,
  label: "SQL",
  defaultOptions: {
    retries: 2,
    baseDelayMs: 1000,
    timeoutMs: 60_000,
  },
});

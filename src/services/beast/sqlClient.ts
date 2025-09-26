import { TORII_SQL_ENDPOINT } from "./constants";

export async function runBeastSql<T = unknown>(query: string, debugLabel: string) {
  console.log(`🔎 Running SQL (${debugLabel}):`, query);

  const url = `${TORII_SQL_ENDPOINT}?query=${encodeURIComponent(query)}`;
  console.log(`🌐 Making request to: ${url}`);

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: { Accept: "application/json" },
    });

    if (!response.ok) {
      const text = await response.text();
      console.error(`❌ SQL API error: ${response.status} ${response.statusText}`, text);
      throw new Error(`SQL API error: ${response.status} ${text}`);
    }

    const data = (await response.json()) as T;

    if (Array.isArray(data) && data.length > 0) {
      console.log(`📦 Sample row (${debugLabel}):`, data[0]);
    } else {
      console.log(`⚠️ No rows returned for ${debugLabel}`);
    }

    return data;
  } catch (error) {
    console.error(`❌ Failed to fetch SQL data for ${debugLabel}:`, error);
    if (error instanceof TypeError && error.message === "Failed to fetch") {
      console.error(`🔗 Network error - check if proxy is working for: ${url}`);
      console.error(`🌐 TORII_SQL_ENDPOINT: ${TORII_SQL_ENDPOINT}`);
      console.error(`🔧 Dev mode: ${import.meta.env.DEV}`);
    }
    throw error;
  }
}

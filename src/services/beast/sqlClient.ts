import { TORII_SQL_ENDPOINT } from "./constants";

export async function runBeastSql<T = unknown>(query: string, debugLabel: string) {
  console.log(`🔎 Running SQL (${debugLabel}):`, query);

  const url = `${TORII_SQL_ENDPOINT}?query=${encodeURIComponent(query)}`;

  const response = await fetch(url, {
    method: "GET",
    headers: { Accept: "application/json" },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`SQL API error: ${response.status} ${text}`);
  }

  const data = (await response.json()) as T;

  if (Array.isArray(data) && data.length > 0) {
    console.log(`📦 Sample row (${debugLabel}):`, data[0]);
  } else {
    console.log(`⚠️ No rows returned for ${debugLabel}`);
  }

  return data;
}

import { TORII_SQL_ENDPOINT } from "./constants";

export async function runBeastSql<T = unknown>(query: string, debugLabel: string) {
  const url = `${TORII_SQL_ENDPOINT}?query=${encodeURIComponent(query)}`;

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: { Accept: "application/json" },
    });

    if (!response.ok) {
      const text = await response.text();
      console.error(`SQL API error: ${response.status} ${response.statusText}`, text);
      throw new Error(`SQL API error: ${response.status} ${text}`);
    }

    const data = (await response.json()) as T;
    return data;
  } catch (error) {
    console.error(`Failed to fetch SQL data for ${debugLabel}:`, error);
    throw error;
  }
}

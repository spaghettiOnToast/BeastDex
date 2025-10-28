import { TORII_SQL_ENDPOINT } from "./constants";

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithRetry(
  url: string,
  init: RequestInit,
  {
    retries = 3,
    baseDelayMs = 500,
    timeoutMs = 30_000,
  }: { retries?: number; baseDelayMs?: number; timeoutMs?: number } = {}
) {
  let attempt = 0;
  let lastError: unknown = null;
  while (attempt <= retries) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort('timeout'), timeoutMs);
    try {
      const response = await fetch(url, {
        ...init,
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (response.ok) return response;

      // Retry on transient 5xx errors (including 502 Bad Gateway)
      if (response.status >= 500 && response.status < 600) {
        const text = await response.text().catch(() => "");
        lastError = new Error(
          `SQL API error: ${response.status} ${response.statusText} ${text}`
        );
        console.warn(`[SQL] Server error (${response.status}), will retry. Attempt ${attempt + 1}/${retries + 1}`);
      } else {
        // Non-retryable
        const text = await response.text().catch(() => "");
        throw new Error(
          `SQL API error: ${response.status} ${response.statusText} ${text}`
        );
      }
    } catch (err) {
      // Distinguish timeouts vs other aborts
      if (
        controller.signal.aborted &&
        (controller.signal as any).reason === 'timeout'
      ) {
        lastError = new Error(`SQL API request timed out after ${timeoutMs}ms`);
        console.warn(`[SQL] Request timeout, will retry. Attempt ${attempt + 1}/${retries + 1}`);
      } else if (err instanceof Error && err.message.includes('Failed to fetch')) {
        // Network error, also retryable
        lastError = err;
        console.warn(`[SQL] Network error, will retry. Attempt ${attempt + 1}/${retries + 1}`);
      } else {
        lastError = err;
      }
      // AbortError or network error eligible for retry
    } finally {
      clearTimeout(timer);
    }

    attempt += 1;
    if (attempt > retries) break;
    const backoff = baseDelayMs * 2 ** (attempt - 1);
    const jitter = Math.floor(Math.random() * 200);
    await sleep(backoff + jitter);
  }
  const finalMessage =
    lastError instanceof Error ? lastError.message : String(lastError);
  throw new Error(`SQL request failed after ${retries + 1} attempts: ${finalMessage}`);
}

export async function runBeastSql<T = unknown>(
  query: string,
  debugLabel: string,
  options?: { retries?: number; baseDelayMs?: number; timeoutMs?: number }
) {
  const url = `${TORII_SQL_ENDPOINT}?query=${encodeURIComponent(query)}`;

  try {
    const response = await fetchWithRetry(
      url,
      {
        method: "GET",
        headers: { Accept: "application/json" },
      },
      { retries: 3, baseDelayMs: 500, timeoutMs: 30_000, ...(options || {}) }
    );

    const data = (await response.json()) as T;
    return data;
  } catch (error) {
    console.error(`[SQL] Failed to fetch data for ${debugLabel}:`, error);
    throw error;
  }
}

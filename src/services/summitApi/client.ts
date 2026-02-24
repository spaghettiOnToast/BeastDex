/**
 * Summit API REST Client
 *
 * Fetch wrapper with retry logic, exponential backoff, and timeouts.
 */

import { SUMMIT_API_URL } from "./constants";

type FetchOptions = {
  retries?: number;
  baseDelayMs?: number;
  timeoutMs?: number;
};

const DEFAULT_OPTIONS: Required<FetchOptions> = {
  retries: 2,
  baseDelayMs: 1000,
  timeoutMs: 30_000,
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function summitApiFetch<T>(
  path: string,
  options?: FetchOptions,
): Promise<T> {
  const { retries, baseDelayMs, timeoutMs } = { ...DEFAULT_OPTIONS, ...options };
  const url = `${SUMMIT_API_URL}${path}`;

  let attempt = 0;
  let lastError: unknown = null;

  while (attempt <= retries) {
    const controller = new AbortController();
    let isTimeout = false;
    const timer = setTimeout(() => {
      isTimeout = true;
      controller.abort();
    }, timeoutMs);

    try {
      const response = await fetch(url, {
        method: "GET",
        headers: { Accept: "application/json" },
        signal: controller.signal,
      });
      clearTimeout(timer);

      if (response.ok) {
        return (await response.json()) as T;
      }

      // Don't retry 4xx client errors (except 429)
      if (response.status >= 400 && response.status < 500 && response.status !== 429) {
        const text = await response.text().catch(() => "");
        throw new Error(
          `Summit API error: ${response.status} ${response.statusText} ${text}`,
        );
      }

      // Retry on 5xx and 429
      const text = await response.text().catch(() => "");
      lastError = new Error(
        `Summit API error: ${response.status} ${response.statusText} ${text}`,
      );
    } catch (err) {
      clearTimeout(timer);
      if (isTimeout) {
        lastError = new Error(`Summit API request timed out after ${timeoutMs}ms`);
      } else if (
        err instanceof Error &&
        err.message.startsWith("Summit API error:")
      ) {
        // Non-retryable client error (4xx except 429) — re-throw immediately
        throw err;
      } else {
        lastError = err;
      }
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
  throw new Error(
    `Summit API request failed after ${retries + 1} attempts: ${finalMessage}`,
  );
}

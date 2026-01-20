/**
 * Shared SQL Client for Torii endpoints
 *
 * This module provides a reusable SQL client that can be configured
 * for different Torii endpoints (pg-beasts, summit, etc.)
 *
 * Features:
 * - Automatic retries with exponential backoff
 * - Request deduplication (prevents duplicate concurrent requests)
 * - Configurable timeouts
 * - Concurrency limiting via semaphore (prevents overwhelming the indexer)
 */

// In-flight request deduplication map (URL -> Promise)
const pendingRequests = new Map<string, Promise<unknown>>();

// Semaphore for limiting concurrent requests
const MAX_CONCURRENT_REQUESTS = 4;
let activeRequests = 0;
const requestQueue: Array<() => void> = [];

async function acquireSemaphore(): Promise<void> {
  if (activeRequests < MAX_CONCURRENT_REQUESTS) {
    activeRequests++;
    return;
  }

  // Wait in queue
  return new Promise((resolve) => {
    requestQueue.push(() => {
      activeRequests++;
      resolve();
    });
  });
}

function releaseSemaphore(): void {
  activeRequests--;
  const next = requestQueue.shift();
  if (next) {
    next();
  }
}

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export type SqlClientOptions = {
  retries?: number;
  baseDelayMs?: number;
  timeoutMs?: number;
};

export type SqlClientConfig = {
  endpoint: string;
  label: string;
  defaultOptions?: SqlClientOptions;
};

async function fetchWithRetry(
  url: string,
  init: RequestInit,
  label: string,
  {
    retries = 3,
    baseDelayMs = 500,
    timeoutMs = 60_000, // Increased from 30s to 60s
  }: SqlClientOptions = {}
) {
  let attempt = 0;
  let lastError: unknown = null;
  const startTime = performance.now();

  console.log(`[${label}] Starting request (timeout: ${timeoutMs}ms, retries: ${retries})`);

  while (attempt <= retries) {
    const attemptStart = performance.now();
    const controller = new AbortController();
    let isTimeout = false;
    const timer = setTimeout(() => {
      isTimeout = true;
      const elapsed = (performance.now() - attemptStart).toFixed(0);
      console.warn(`[${label}] Aborting request after ${elapsed}ms (timeout: ${timeoutMs}ms)`);
      controller.abort();
    }, timeoutMs);

    try {
      const response = await fetch(url, {
        ...init,
        signal: controller.signal,
      });
      clearTimeout(timer);

      const elapsed = (performance.now() - attemptStart).toFixed(0);
      if (response.ok) {
        console.log(`[${label}] Request succeeded in ${elapsed}ms (attempt ${attempt + 1})`);
        return response;
      }

      // Retry on transient 5xx errors (including 502 Bad Gateway)
      if (response.status >= 500 && response.status < 600) {
        const text = await response.text().catch(() => "");
        lastError = new Error(
          `SQL API error: ${response.status} ${response.statusText} ${text}`
        );
        console.warn(
          `[${label}] Server error (${response.status}) after ${elapsed}ms, will retry. Attempt ${attempt + 1}/${retries + 1}`
        );
      } else {
        // Non-retryable
        const text = await response.text().catch(() => "");
        console.error(`[${label}] Non-retryable error (${response.status}) after ${elapsed}ms: ${text}`);
        throw new Error(
          `SQL API error: ${response.status} ${response.statusText} ${text}`
        );
      }
    } catch (err) {
      clearTimeout(timer);
      const elapsed = (performance.now() - attemptStart).toFixed(0);

      // Distinguish timeouts vs other aborts
      if (controller.signal.aborted && isTimeout) {
        lastError = new Error(`SQL API request timed out after ${timeoutMs}ms`);
        console.warn(
          `[${label}] Request timeout after ${elapsed}ms, will retry. Attempt ${attempt + 1}/${retries + 1}`
        );
      } else if (
        err instanceof Error &&
        err.message.includes("Failed to fetch")
      ) {
        // Network error, also retryable
        lastError = err;
        console.warn(
          `[${label}] Network error after ${elapsed}ms: ${err.message}, will retry. Attempt ${attempt + 1}/${retries + 1}`
        );
      } else if (
        err instanceof Error &&
        err.name === "AbortError" &&
        isTimeout
      ) {
        lastError = new Error(`SQL API request timed out after ${timeoutMs}ms`);
        console.warn(
          `[${label}] Request timeout (AbortError) after ${elapsed}ms, will retry. Attempt ${attempt + 1}/${retries + 1}`
        );
      } else if (err instanceof Error && err.name === "AbortError") {
        // Aborted but not by our timeout - could be browser or user navigation
        lastError = new Error(`Request aborted externally after ${elapsed}ms`);
        console.warn(
          `[${label}] Request aborted externally after ${elapsed}ms (not timeout). Attempt ${attempt + 1}/${retries + 1}`
        );
      } else {
        lastError = err;
        console.warn(
          `[${label}] Unknown error after ${elapsed}ms: ${err instanceof Error ? err.message : String(err)}. Attempt ${attempt + 1}/${retries + 1}`
        );
      }
      // AbortError or network error eligible for retry
    } finally {
      clearTimeout(timer);
    }

    attempt += 1;
    if (attempt > retries) break;
    const backoff = baseDelayMs * 2 ** (attempt - 1);
    const jitter = Math.floor(Math.random() * 200);
    console.log(`[${label}] Waiting ${backoff + jitter}ms before retry ${attempt + 1}`);
    await sleep(backoff + jitter);
  }

  const totalTime = (performance.now() - startTime).toFixed(0);
  const finalMessage =
    lastError instanceof Error ? lastError.message : String(lastError);
  console.error(`[${label}] Request failed after ${retries + 1} attempts (${totalTime}ms total): ${finalMessage}`);
  throw new Error(
    `SQL request failed after ${retries + 1} attempts: ${finalMessage}`
  );
}

/**
 * Creates a SQL client function for a specific Torii endpoint
 */
export function createSqlClient(config: SqlClientConfig) {
  const { endpoint, label, defaultOptions = {} } = config;

  return async function runSql<T = unknown>(
    query: string,
    debugLabel: string,
    options?: SqlClientOptions
  ): Promise<T> {
    const url = `${endpoint}?query=${encodeURIComponent(query)}`;
    const mergedOptions = { ...defaultOptions, ...options };

    // Check for in-flight request with same URL (deduplication)
    const existingRequest = pendingRequests.get(url);
    if (existingRequest) {
      if (import.meta.env.DEV) {
        console.log(`[${label}] Deduplicating request for ${debugLabel}`);
      }
      return existingRequest as Promise<T>;
    }

    // Create the request promise with semaphore
    const requestPromise = (async () => {
      await acquireSemaphore();
      try {
        const response = await fetchWithRetry(
          url,
          {
            method: "GET",
            headers: { Accept: "application/json" },
          },
          label,
          mergedOptions
        );

        const data = (await response.json()) as T;
        return data;
      } catch (error) {
        console.error(`[${label}] Failed to fetch data for ${debugLabel}:`, error);
        throw error;
      } finally {
        releaseSemaphore();
        // Clean up the pending request
        pendingRequests.delete(url);
      }
    })();

    // Store the pending request for deduplication
    pendingRequests.set(url, requestPromise);

    return requestPromise;
  };
}

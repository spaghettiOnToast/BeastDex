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
// Reduced from 4 to 2 to avoid overwhelming the indexer
const MAX_CONCURRENT_REQUESTS = 2;
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
  _label: string,
  {
    retries = 3,
    baseDelayMs = 500,
    timeoutMs = 60_000, // Increased from 30s to 60s
  }: SqlClientOptions = {}
) {
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
        ...init,
        signal: controller.signal,
      });
      clearTimeout(timer);

      if (response.ok) {
        return response;
      }

      // Retry on transient 5xx errors (including 502 Bad Gateway)
      const text = await response.text().catch(() => "");
      if (response.status >= 500 && response.status < 600) {
        lastError = new Error(
          `SQL API error: ${response.status} ${response.statusText} ${text}`
        );
      } else {
        // Non-retryable
        throw new Error(
          `SQL API error: ${response.status} ${response.statusText} ${text}`
        );
      }
    } catch (err) {
      clearTimeout(timer);

      // Distinguish timeouts vs other aborts
      if (controller.signal.aborted && isTimeout) {
        lastError = new Error(`SQL API request timed out after ${timeoutMs}ms`);
      } else if (err instanceof Error && err.name === "AbortError" && isTimeout) {
        lastError = new Error(`SQL API request timed out after ${timeoutMs}ms`);
      } else if (err instanceof Error && err.name === "AbortError") {
        lastError = new Error("Request aborted externally");
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
  throw new Error(
    `SQL request failed after ${retries + 1} attempts: ${finalMessage}`
  );
}

/**
 * Creates a SQL client function for a specific Torii endpoint
 */
export function createSqlClient(config: SqlClientConfig) {
  const { endpoint, label: _label, defaultOptions = {} } = config;

  return async function runSql<T = unknown>(
    query: string,
    _debugLabel: string,
    options?: SqlClientOptions
  ): Promise<T> {
    const url = `${endpoint}?query=${encodeURIComponent(query)}`;
    const mergedOptions = { ...defaultOptions, ...options };

    // Check for in-flight request with same URL (deduplication)
    const existingRequest = pendingRequests.get(url);
    if (existingRequest) {
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
          _label,
          mergedOptions
        );

        const data = (await response.json()) as T;
        return data;
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

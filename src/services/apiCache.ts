interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

interface CacheConfig {
  ttl: number; // Time to live in milliseconds
}

class ApiCache {
  private cache = new Map<string, CacheEntry<any>>();
  private pendingRequests = new Map<string, Promise<any>>();
  private cacheConfigs = new Map<string, CacheConfig>();

  constructor() {
    // Set default cache configurations for different API endpoints
    // Note: Shorter TTLs to account for SQL endpoint sync delays
    this.cacheConfigs.set("beast-filters", { ttl: 10 * 60 * 1000 }); // 10 minutes (static data)
    this.cacheConfigs.set("beast-by-id", { ttl: 30 * 1000 }); // 30 seconds (can change frequently)
    this.cacheConfigs.set("beast-query", { ttl: 15 * 1000 }); // 15 seconds (ownership changes)
    this.cacheConfigs.set("adventurer-deaths", { ttl: 1 * 60 * 1000 }); // 1 minute
    this.cacheConfigs.set("beast-power-rank", { ttl: 1 * 60 * 1000 }); // 1 minute
  }

  private getCacheKey(endpoint: string, params: any): string {
    return `${endpoint}:${JSON.stringify(params)}`;
  }

  private isExpired(entry: CacheEntry<any>, cacheConfig: CacheConfig): boolean {
    return Date.now() - entry.timestamp > cacheConfig.ttl;
  }

  async get<T>(
    endpoint: string,
    params: any,
    fetchFunction: () => Promise<T>
  ): Promise<T> {
    const cacheKey = this.getCacheKey(endpoint, params);
    const cacheConfig = this.cacheConfigs.get(endpoint) || { ttl: 2 * 60 * 1000 }; // Default 2 minutes

    // Check cache
    const cached = this.cache.get(cacheKey);
    if (cached && !this.isExpired(cached, cacheConfig)) {
      return cached.data as T;
    }

    // Check pending requests to avoid duplicate concurrent requests
    const pending = this.pendingRequests.get(cacheKey);
    if (pending) {
      return pending as Promise<T>;
    }

    // Make new request
    const request = fetchFunction();
    this.pendingRequests.set(cacheKey, request);

    try {
      const result = await request;

      // Cache the result
      this.cache.set(cacheKey, {
        data: result,
        timestamp: Date.now(),
      });

      return result;
    } finally {
      // Clean up pending request
      this.pendingRequests.delete(cacheKey);
    }
  }

  // Clear expired entries to prevent memory leaks
  cleanupExpired(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      const endpoint = key.split(':')[0];
      const cacheConfig = this.cacheConfigs.get(endpoint) || { ttl: 2 * 60 * 1000 };

      if (now - entry.timestamp > cacheConfig.ttl) {
        this.cache.delete(key);
      }
    }
  }

  // Clear all cache entries
  clearAll(): void {
    this.cache.clear();
    this.pendingRequests.clear();
  }

  // Clear specific endpoint cache
  clearEndpoint(endpoint: string): void {
    for (const key of this.cache.keys()) {
      if (key.startsWith(`${endpoint}:`)) {
        this.cache.delete(key);
      }
    }
  }

  // Get cache statistics
  getStats() {
    return {
      cacheSize: this.cache.size,
      pendingRequests: this.pendingRequests.size,
      endpoints: Array.from(this.cacheConfigs.keys()),
    };
  }
}

// Export a singleton instance
export const apiCache = new ApiCache();

// Set up periodic cleanup (every 5 minutes)
if (typeof window !== 'undefined') {
  setInterval(() => {
    apiCache.cleanupExpired();
  }, 5 * 60 * 1000);
}
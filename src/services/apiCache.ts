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
    // Longer TTLs reduce load on the indexer while still providing reasonably fresh data
    this.cacheConfigs.set("beast-filters", { ttl: 30 * 60 * 1000 }); // 30 minutes (static data)
    this.cacheConfigs.set("beast-by-id", { ttl: 2 * 60 * 1000 }); // 2 minutes
    this.cacheConfigs.set("beast-query", { ttl: 2 * 60 * 1000 }); // 2 minutes
    this.cacheConfigs.set("top-beasts", { ttl: 30 * 60 * 1000 }); // 30 minutes (top beasts rarely change)
    this.cacheConfigs.set("adventurer-deaths", { ttl: 5 * 60 * 1000 }); // 5 minutes
    this.cacheConfigs.set("beast-stats", { ttl: 5 * 60 * 1000 }); // 5 minutes
    this.cacheConfigs.set("beast-highlights", { ttl: 5 * 60 * 1000 }); // 5 minutes
    this.cacheConfigs.set("beast-of-the-day", { ttl: 3 * 60 * 1000 }); // 3 minutes
    this.cacheConfigs.set("power-rank-leaderboard", { ttl: 5 * 60 * 1000 }); // 5 minutes
    this.cacheConfigs.set("owner-beast-stats", { ttl: 5 * 60 * 1000 }); // 5 minutes
    this.cacheConfigs.set("owner-beast-highlights", { ttl: 5 * 60 * 1000 }); // 5 minutes
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

  // Clear all beast-related caches (useful after purchases/updates)
  clearBeastCaches(): void {
    const beastEndpoints = [
      'beast-by-id',
      'beast-query',
      'beast-stats',
      'beast-highlights',
      'beast-of-the-day',
      'power-rank-leaderboard',
    ];

    beastEndpoints.forEach(endpoint => this.clearEndpoint(endpoint));
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

/**
 * Shared Cache Module
 *
 * Provides a configurable cache factory for different caching use cases
 * across the application.
 */

export interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

export interface CacheConfig {
  /** Time to live in milliseconds (0 = never expires) */
  ttl: number;
  /** Maximum number of entries (0 = unlimited) */
  maxSize?: number;
  /** Whether to deduplicate concurrent requests for the same key */
  deduplicateRequests?: boolean;
}

export interface CacheStats {
  size: number;
  pendingRequests: number;
  hitCount: number;
  missCount: number;
}

/**
 * Generic cache with TTL support, request deduplication, and LRU eviction
 */
export class Cache<T> {
  private cache = new Map<string, CacheEntry<T>>();
  private pendingRequests = new Map<string, Promise<T>>();
  private hitCount = 0;
  private missCount = 0;
  private config: CacheConfig;

  constructor(config: CacheConfig) {
    this.config = config;
  }

  private isExpired(entry: CacheEntry<T>): boolean {
    if (this.config.ttl === 0) return false;
    return Date.now() - entry.timestamp > this.config.ttl;
  }

  private evictOldestIfNeeded(): void {
    if (!this.config.maxSize || this.cache.size < this.config.maxSize) return;

    // LRU: Remove oldest entry
    const firstKey = this.cache.keys().next().value;
    if (firstKey) {
      this.cache.delete(firstKey);
    }
  }

  /**
   * Get a value from cache, or fetch it if not present/expired
   */
  async get(key: string, fetchFn: () => Promise<T>): Promise<T> {
    // Check cache
    const cached = this.cache.get(key);
    if (cached && !this.isExpired(cached)) {
      this.hitCount++;
      // Move to end for LRU
      this.cache.delete(key);
      this.cache.set(key, cached);
      return cached.data;
    }

    this.missCount++;

    // Check pending requests to avoid duplicate concurrent requests
    if (this.config.deduplicateRequests !== false) {
      const pending = this.pendingRequests.get(key);
      if (pending) {
        return pending;
      }
    }

    // Make new request
    const request = fetchFn();

    if (this.config.deduplicateRequests !== false) {
      this.pendingRequests.set(key, request);
    }

    try {
      const result = await request;
      this.set(key, result);
      return result;
    } finally {
      this.pendingRequests.delete(key);
    }
  }

  /**
   * Directly set a value in cache
   */
  set(key: string, data: T): void {
    this.evictOldestIfNeeded();
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
    });
  }

  /**
   * Get a value directly from cache without fetching
   */
  peek(key: string): T | undefined {
    const cached = this.cache.get(key);
    if (cached && !this.isExpired(cached)) {
      return cached.data;
    }
    return undefined;
  }

  /**
   * Check if key exists and is not expired
   */
  has(key: string): boolean {
    const cached = this.cache.get(key);
    return cached !== undefined && !this.isExpired(cached);
  }

  /**
   * Delete a specific key
   */
  delete(key: string): boolean {
    return this.cache.delete(key);
  }

  /**
   * Delete all keys matching a prefix
   */
  deleteByPrefix(prefix: string): number {
    let deleted = 0;
    for (const key of this.cache.keys()) {
      if (key.startsWith(prefix)) {
        this.cache.delete(key);
        deleted++;
      }
    }
    return deleted;
  }

  /**
   * Clear all entries
   */
  clear(): void {
    this.cache.clear();
    this.pendingRequests.clear();
  }

  /**
   * Remove expired entries
   */
  cleanupExpired(): number {
    let cleaned = 0;
    for (const [key, entry] of this.cache.entries()) {
      if (this.isExpired(entry)) {
        this.cache.delete(key);
        cleaned++;
      }
    }
    return cleaned;
  }

  /**
   * Get cache statistics
   */
  getStats(): CacheStats {
    return {
      size: this.cache.size,
      pendingRequests: this.pendingRequests.size,
      hitCount: this.hitCount,
      missCount: this.missCount,
    };
  }

  /**
   * Get hit rate as a percentage
   */
  getHitRate(): number {
    const total = this.hitCount + this.missCount;
    return total === 0 ? 0 : (this.hitCount / total) * 100;
  }
}

/**
 * Create a cache key from an endpoint and parameters
 */
export function createCacheKey(endpoint: string, params?: unknown): string {
  if (params === undefined) {
    return endpoint;
  }
  return `${endpoint}:${JSON.stringify(params)}`;
}

/**
 * Pre-configured cache instances for common use cases
 */
export const cachePresets = {
  /** Short-lived cache for frequently changing data (30 seconds) */
  shortLived: { ttl: 30 * 1000, deduplicateRequests: true },

  /** Medium-lived cache for semi-static data (2 minutes) */
  mediumLived: { ttl: 2 * 60 * 1000, deduplicateRequests: true },

  /** Long-lived cache for static data (30 minutes) */
  longLived: { ttl: 30 * 60 * 1000, deduplicateRequests: true },

  /** Never expires (useful for immutable data) */
  permanent: { ttl: 0, deduplicateRequests: true },

  /** Session cache with size limit */
  session: { ttl: 0, maxSize: 1000, deduplicateRequests: true },
} as const;

import { lookupControllerUsernames } from "./controller";
import { normaliseStarknetAddresses } from "../utils/address";
import { config } from "../config";

interface CacheEntry {
  data: Record<string, string>;
  timestamp: number;
  promise?: Promise<Record<string, string>>;
}

class UsernameCache {
  private cache = new Map<string, CacheEntry>();
  private pendingRequests = new Map<string, Promise<Record<string, string>>>();

  private getCacheKey(addresses: string[]): string {
    return addresses.sort().join(",");
  }

  private isExpired(entry: CacheEntry): boolean {
    return Date.now() - entry.timestamp > config.cache.usernameTtl;
  }

  async getUsernames(addresses: Array<string | null | undefined>): Promise<Record<string, string>> {
    const normalizedAddresses = normaliseStarknetAddresses(addresses);

    if (normalizedAddresses.length === 0) {
      return {};
    }

    const cacheKey = this.getCacheKey(normalizedAddresses);

    // Check cache
    const cached = this.cache.get(cacheKey);
    if (cached && !this.isExpired(cached)) {
      return cached.data;
    }

    // Check pending requests
    const pending = this.pendingRequests.get(cacheKey);
    if (pending) {
      return pending;
    }

    // Make new request
    const request = this.fetchUsernames(normalizedAddresses);
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

  private async fetchUsernames(addresses: string[]): Promise<Record<string, string>> {
    const result = await lookupControllerUsernames(addresses);
    return result;
  }

  // For testing or manual cache management
  clearCache(): void {
    this.cache.clear();
    this.pendingRequests.clear();
  }

  getCacheStats() {
    return {
      cacheSize: this.cache.size,
      pendingRequests: this.pendingRequests.size,
    };
  }
}

export const usernameCache = new UsernameCache();
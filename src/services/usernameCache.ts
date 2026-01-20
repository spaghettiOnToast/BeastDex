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
    const result: Record<string, string> = {};

    // 1. Get Cartridge usernames (fast, single API call)
    try {
      const cartridgeUsernames = await lookupControllerUsernames(addresses);
      Object.assign(result, cartridgeUsernames);
    } catch (error) {
      console.warn("Failed to fetch Cartridge usernames:", error);
    }

    // 2. For addresses without Cartridge usernames, use truncated wallet address
    // Note: Starknet.id lookups removed for performance - still available via search/account pages
    addresses.forEach(address => {
      const normalizedAddress = address.toLowerCase();
      if (!result[normalizedAddress]) {
        // Format: 0x123...abc (first 6 + last 4 chars)
        if (address.length > 10) {
          result[normalizedAddress] = `${address.slice(0, 6)}...${address.slice(-4)}`;
        } else {
          result[normalizedAddress] = address;
        }
      }
    });

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
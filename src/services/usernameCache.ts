import { lookupControllerUsernames } from "./controller";
import { normaliseStarknetAddresses } from "../utils/address";
import { config } from "../config";

interface CacheEntry {
  username: string;
  timestamp: number;
}

// Debounce window for batching requests (ms)
const BATCH_DELAY_MS = 50;

class UsernameCache {
  // Individual address → username cache with TTL
  private cache = new Map<string, CacheEntry>();

  // Pending batch: addresses waiting to be fetched
  private pendingBatch = new Set<string>();

  // Promises waiting for the current batch to complete
  private batchWaiters: Array<{
    addresses: string[];
    resolve: (result: Record<string, string>) => void;
    reject: (error: Error) => void;
  }> = [];

  // Timer for batch execution
  private batchTimer: ReturnType<typeof setTimeout> | null = null;

  private isExpired(entry: CacheEntry): boolean {
    return Date.now() - entry.timestamp > config.cache.usernameTtl;
  }

  private truncateAddress(address: string): string {
    if (address.length > 10) {
      return `${address.slice(0, 6)}...${address.slice(-4)}`;
    }
    return address;
  }

  async getUsernames(addresses: Array<string | null | undefined>): Promise<Record<string, string>> {
    const normalizedAddresses = normaliseStarknetAddresses(addresses);

    if (normalizedAddresses.length === 0) {
      return {};
    }

    const result: Record<string, string> = {};
    const addressesToFetch: string[] = [];

    // Check cache for each address individually
    for (const address of normalizedAddresses) {
      const cached = this.cache.get(address);
      if (cached && !this.isExpired(cached)) {
        result[address] = cached.username;
      } else {
        addressesToFetch.push(address);
      }
    }

    // If all addresses are cached, return immediately
    if (addressesToFetch.length === 0) {
      return result;
    }

    // Add to pending batch and wait for results
    const fetchedUsernames = await this.addToBatch(addressesToFetch);

    // Merge fetched results with cached results
    Object.assign(result, fetchedUsernames);

    return result;
  }

  private addToBatch(addresses: string[]): Promise<Record<string, string>> {
    return new Promise((resolve, reject) => {
      // Add addresses to pending batch
      for (const address of addresses) {
        this.pendingBatch.add(address);
      }

      // Register this request's waiter
      this.batchWaiters.push({ addresses, resolve, reject });

      // Start or reset the batch timer
      if (this.batchTimer) {
        clearTimeout(this.batchTimer);
      }

      this.batchTimer = setTimeout(() => {
        this.executeBatch();
      }, BATCH_DELAY_MS);
    });
  }

  private async executeBatch(): Promise<void> {
    // Grab current batch and waiters
    const addressesToFetch = Array.from(this.pendingBatch);
    const waiters = [...this.batchWaiters];

    // Clear for next batch
    this.pendingBatch.clear();
    this.batchWaiters = [];
    this.batchTimer = null;

    if (addressesToFetch.length === 0) {
      return;
    }

    try {
      // Fetch all usernames in a single API call
      const fetchedUsernames = await lookupControllerUsernames(addressesToFetch);

      // Cache individual results
      const now = Date.now();
      for (const address of addressesToFetch) {
        const username = fetchedUsernames[address] || this.truncateAddress(address);
        this.cache.set(address, { username, timestamp: now });
      }

      // Resolve all waiters with their requested addresses
      for (const waiter of waiters) {
        const result: Record<string, string> = {};
        for (const address of waiter.addresses) {
          const cached = this.cache.get(address);
          result[address] = cached?.username || this.truncateAddress(address);
        }
        waiter.resolve(result);
      }
    } catch (error) {
      console.warn("Failed to fetch Cartridge usernames:", error);

      // On error, return truncated addresses as fallback
      const now = Date.now();
      for (const address of addressesToFetch) {
        const truncated = this.truncateAddress(address);
        this.cache.set(address, { username: truncated, timestamp: now });
      }

      for (const waiter of waiters) {
        const result: Record<string, string> = {};
        for (const address of waiter.addresses) {
          result[address] = this.truncateAddress(address);
        }
        waiter.resolve(result);
      }
    }
  }

  // For testing or manual cache management
  clearCache(): void {
    this.cache.clear();
    this.pendingBatch.clear();
    this.batchWaiters = [];
    if (this.batchTimer) {
      clearTimeout(this.batchTimer);
      this.batchTimer = null;
    }
  }

  getCacheStats() {
    return {
      cacheSize: this.cache.size,
      pendingBatch: this.pendingBatch.size,
      waitingRequests: this.batchWaiters.length,
    };
  }
}

export const usernameCache = new UsernameCache();
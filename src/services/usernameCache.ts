import { lookupWalletNames } from "./walletNames";
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
        if (cached.username) result[address] = cached.username;
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
      // Controller usernames, then .brother names (profanity filtered)
      const fetchedUsernames = await lookupWalletNames(addressesToFetch);

      // Cache individual results
      const now = Date.now();
      for (const address of addressesToFetch) {
        // "" = looked up, no name. Callers show/link the full address then; a
        // shortened address here was once mistaken for a username and linked
        // to /collection/0x1234...abcd (a page that can't resolve).
        this.cache.set(address, { username: fetchedUsernames[address] || "", timestamp: now });
      }

      // Resolve all waiters with their requested addresses
      for (const waiter of waiters) {
        const result: Record<string, string> = {};
        for (const address of waiter.addresses) {
          const username = this.cache.get(address)?.username;
          if (username) result[address] = username;
        }
        waiter.resolve(result);
      }
    } catch (error) {
      console.warn("Failed to fetch Cartridge usernames:", error);

      // On error, return no names (not cached, so the next call retries).
      for (const waiter of waiters) waiter.resolve({});
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
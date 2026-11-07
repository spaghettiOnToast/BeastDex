import { RpcProvider } from 'starknet';

export type TxFinalOutcome = 'success' | 'reverted' | 'rejected' | 'timeout' | 'unknown';

/**
 * RPC for reads and receipt polling. Defaults to Provable's public mainnet RPC
 * (what lootsurvivor.io uses): the Cartridge endpoint answers "Unauthorized"
 * to unauthenticated starknet_call / receipt requests.
 */
export const DEFAULT_RPC_URL = 'https://rpc.provable.games/rpc';

export function resolveRpcUrl(): string {
  const envUrl = (import.meta as any)?.env?.VITE_RPC_URL as string | undefined;
  return envUrl || DEFAULT_RPC_URL;
}

/** Configured RPC first, then the public default (deduplicated). */
export function readRpcUrls(): string[] {
  return Array.from(new Set([resolveRpcUrl(), DEFAULT_RPC_URL]));
}

const providerCache = new Map<string, RpcProvider>();
const providerFor = (url: string) => {
  let p = providerCache.get(url);
  if (!p) providerCache.set(url, (p = new RpcProvider({ nodeUrl: url })));
  return p;
};

/** An RPC that refuses unauthenticated reads (e.g. the Cartridge endpoint). */
function isAccessError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err ?? '');
  return /unauthori[sz]ed|forbidden|\b401\b|\b403\b|Unexpected token 'U'/i.test(msg);
}

/**
 * Run a read against the configured RPC, falling back to the public default
 * when the configured one refuses access.
 */
export async function withReadProvider<T>(fn: (provider: RpcProvider) => Promise<T>): Promise<T> {
  const urls = readRpcUrls();
  let lastErr: unknown;
  for (const url of urls) {
    try {
      return await fn(providerFor(url));
    } catch (err) {
      lastErr = err;
      if (!isAccessError(err)) throw err;
    }
  }
  throw lastErr;
}

/**
 * RpcProvider whose `callContract` falls back to the public default RPC when
 * the configured one refuses unauthenticated reads. For code that needs a
 * provider object (e.g. passes it into helpers) rather than `withReadProvider`.
 */
class FallbackReadProvider extends RpcProvider {
  override async callContract(...args: Parameters<RpcProvider['callContract']>) {
    try {
      return await super.callContract(...args);
    } catch (err) {
      const fallback = readRpcUrls().find((url) => url !== resolveRpcUrl());
      if (!fallback || !isAccessError(err)) throw err;
      return providerFor(fallback).callContract(...args);
    }
  }
}

let readProvider: FallbackReadProvider | null = null;

/** Shared read-only provider (configured RPC, public fallback on access errors). */
export function getReadProvider(): RpcProvider {
  if (!readProvider) readProvider = new FallbackReadProvider({ nodeUrl: resolveRpcUrl() });
  return readProvider;
}

export async function waitForTx(
  txHash: string,
  {
    timeoutMs = 120_000,
    pollIntervalMs = 3_000,
  }: { timeoutMs?: number; pollIntervalMs?: number } = {}
): Promise<TxFinalOutcome> {
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    try {
      const receipt: any = await withReadProvider((provider) => provider.getTransactionReceipt(txHash));
      const finality = receipt?.finality_status || receipt?.status;
      const exec = receipt?.execution_status;

      // Handle execution reverted
      if (exec === 'REVERTED') return 'reverted';

      // Finalized / accepted on L2/L1
      if (finality === 'ACCEPTED_ON_L2' || finality === 'ACCEPTED_ON_L1') {
        if (exec === 'SUCCEEDED' || !exec) return 'success';
        if (exec === 'REVERTED') return 'reverted';
        return 'success';
      }

      if (finality === 'REJECTED') return 'rejected';
      // NOT_RECEIVED/RECEIVED -> keep polling
    } catch (err) {
      // If not found yet, keep polling
    }

    await new Promise((r) => setTimeout(r, pollIntervalMs));
  }

  return 'timeout';
}


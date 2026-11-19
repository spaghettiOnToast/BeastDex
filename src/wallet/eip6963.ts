/**
 * EIP-6963 discovery of injected EVM wallets (Rabby, MetaMask, ...). Wallets
 * announce themselves in reply to `eip6963:requestProvider`; extensions inject
 * before the app's scripts, so asking at import time finds them before React
 * mounts (starknet-react's autoConnect only looks at the first connector list).
 */
export type Eip1193Provider = {
  request(args: { method: string; params?: unknown[] | Record<string, unknown> }): Promise<unknown>;
  on?(event: string, listener: (...args: unknown[]) => void): void;
  removeListener?(event: string, listener: (...args: unknown[]) => void): void;
};

export type EvmWalletInfo = { uuid: string; name: string; icon: string; rdns: string };
export type EvmWallet = { info: EvmWalletInfo; provider: Eip1193Provider };

const wallets = new Map<string, EvmWallet>();
const listeners = new Set<() => void>();
let snapshot: EvmWallet[] = [];

function onAnnounce(event: Event) {
  const detail = (event as CustomEvent<EvmWallet>).detail;
  const rdns = detail?.info?.rdns;
  if (!rdns || typeof detail.provider?.request !== "function") return;
  if (wallets.get(rdns)?.provider === detail.provider) return;
  wallets.set(rdns, { info: { ...detail.info }, provider: detail.provider });
  snapshot = [...wallets.values()];
  listeners.forEach((l) => l());
}

if (typeof window !== "undefined") {
  window.addEventListener("eip6963:announceProvider", onAnnounce);
  window.dispatchEvent(new Event("eip6963:requestProvider"));
}

export function getEvmWallets(): EvmWallet[] {
  return snapshot;
}

export function getEvmWallet(rdns: string): EvmWallet | undefined {
  return wallets.get(rdns);
}

export function subscribeEvmWallets(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The wallet once it has announced, or undefined after `timeoutMs`. */
export function waitForEvmWallet(rdns: string, timeoutMs = 600): Promise<EvmWallet | undefined> {
  const found = wallets.get(rdns);
  if (found || typeof window === "undefined") return Promise.resolve(found);
  return new Promise((resolve) => {
    const done = () => {
      clearTimeout(timer);
      unsubscribe();
      resolve(wallets.get(rdns));
    };
    const unsubscribe = subscribeEvmWallets(() => wallets.has(rdns) && done());
    const timer = setTimeout(done, timeoutMs);
    window.dispatchEvent(new Event("eip6963:requestProvider"));
  });
}

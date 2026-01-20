/**
 * Fetch URL Rewrite Patch
 *
 * Patches the global fetch to rewrite broken Cartridge SDK endpoints.
 * The SDK has hardcoded broken endpoints (arcade-mainnet) that need
 * to be rewritten to working ones (arcade-main).
 *
 * This must be loaded early, before any SDK initialization.
 */

const REWRITE_PATTERNS = [
  { from: "https://api.cartridge.gg/x/arcade-mainnet/torii", to: "https://api.cartridge.gg/x/arcade-main/torii" },
  { from: "https://api.cartridge.gg/x/arcade-mainnet-2/torii", to: "https://api.cartridge.gg/x/arcade-main/torii" },
  { from: "https://api.cartridge.gg/x/marketplace-mainnet/torii", to: "https://api.cartridge.gg/x/arcade-main/torii" },
];

declare global {
  interface Window {
    __toriiFetchPatched?: boolean;
  }
}

export function installFetchPatch(): void {
  if (typeof window === "undefined") return;
  if (window.__toriiFetchPatched) return;

  try {
    const originalFetch = window.fetch.bind(window);
    window.__toriiFetchPatched = true;

    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      let url = typeof input === "string" ? input : (input as Request).url ?? String(input);

      if (typeof url === "string") {
        for (const { from, to } of REWRITE_PATTERNS) {
          if (url.startsWith(from)) {
            const rewritten = url.replace(from, to);
            if (import.meta.env.DEV) {
              console.log(`[Fetch] Rewriting URL: ${from} -> ${to}`);
            }
            input = typeof input === "string" ? rewritten : new Request(rewritten, input as Request);
            break;
          }
        }
      }

      return originalFetch(input, init);
    };
  } catch (err) {
    console.warn("[Fetch] Failed to install URL rewrite patch:", err);
  }
}

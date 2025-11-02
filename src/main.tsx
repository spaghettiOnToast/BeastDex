import { StrictMode, useEffect, useState, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import "./index.css";
import App from "./App.tsx";
import { DojoSdkProvider } from "@dojoengine/sdk/react";
import {
  ArcadeProvider,
  MarketplaceContextProvider,
  configs,
  initSDK,
} from "@cartridge/marketplace";
import { ToriiClient } from "@dojoengine/torii-wasm";
import { constants } from "starknet";
import { apiCache } from "./services/apiCache";

// Expose apiCache in dev mode for debugging
if (import.meta.env.DEV) {
  (window as any).apiCache = apiCache;
  // Only clear cache on hard refresh (Cmd+Shift+R) to improve dev performance
  // Manual clear: window.apiCache.clearAll()
}

// Runtime safety net: rewrite any lingering arcade-mainnet Torii calls to arcade-main
// Some downstream packages may have baked-in defaults; this keeps them aligned.
try {
  const originalFetch = window.fetch.bind(window);
  const OLD_BASE = 'https://api.cartridge.gg/x/arcade-mainnet/torii';
  const NEW_BASE = 'https://api.cartridge.gg/x/arcade-main/torii';
  // Only patch once
  if (!(window as any).__toriiFetchPatched) {
    (window as any).__toriiFetchPatched = true;
    window.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      let url = typeof input === 'string' ? input : (input as Request).url ?? String(input);
      if (typeof url === 'string' && url.startsWith(OLD_BASE)) {
        const rewritten = url.replace(OLD_BASE, NEW_BASE);
        console.log(`🔁 Rewriting Torii URL:`, url, '->', rewritten);
        if (typeof input === 'string') {
          input = rewritten;
        } else {
          // Clone request with new URL
          input = new Request(rewritten, input as Request);
        }
      }
      return originalFetch(input as any, init as any);
    }) as any;
  }
} catch (err) {
  console.warn('Failed to install Torii URL rewrite shim', err);
}

const queryClient = new QueryClient();

type MarketplaceSDK = Awaited<ReturnType<typeof initSDK>>;

function MarketplaceProviders({ children }: { children: ReactNode }) {
  const [sdk, setSdk] = useState<MarketplaceSDK | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // CRITICAL FIX: Modify config BEFORE initializing SDK
        const config = configs[constants.StarknetChainId.SN_MAIN];

        // Fix incorrect toriiUrl in Cartridge SDK (arcade-mainnet -> arcade-main)
        // This must happen before initSDK creates internal clients
        if (config?.toriiUrl) {
          const originalUrl = config.toriiUrl;

          // Replace ALL occurrences of arcade-mainnet with arcade-main
          config.toriiUrl = config.toriiUrl.replace(/arcade-mainnet/g, 'arcade-main');

          if (originalUrl !== config.toriiUrl) {
            console.log(`✅ Fixed Cartridge SDK Torii URL: ${originalUrl} -> ${config.toriiUrl}`);
          }
        }

        // Optional: Override World address from env to match Controller
        const envWorld = (import.meta.env.VITE_WORLD_ADDRESS as string | undefined)?.trim();
        if (envWorld && config?.manifest?.world?.address) {
          const prevWorld = config.manifest.world.address;
          if (prevWorld?.toLowerCase() !== envWorld.toLowerCase()) {
            (config.manifest as any).world = { ...(config.manifest as any).world, address: envWorld };
            console.log(`✅ Overrode World address: ${prevWorld} -> ${envWorld}`);
          }
        }

        // Optional: Override RPC URL from env to ensure alignment
        const envRpc = (import.meta.env.VITE_RPC_URL as string | undefined)?.trim();
        if (envRpc && config?.rpcUrl) {
          const prevRpc = config.rpcUrl;
          if (prevRpc !== envRpc) {
            (config as any).rpcUrl = envRpc;
            console.log(`✅ Overrode RPC URL: ${prevRpc} -> ${envRpc}`);
          }
        }

        // Override Marketplace contract address from env
        const envMarketplace = (import.meta.env.VITE_MARKETPLACE_ADDRESS as string | undefined)?.trim();
        if (envMarketplace && config?.manifest?.contracts && Array.isArray((config.manifest as any).contracts)) {
          const contracts = (config.manifest as any).contracts as Array<{ tag?: string; address?: string }>;
          const idx = contracts.findIndex((c) => (c?.tag || "").toUpperCase() === "MARKETPLACE-MARKETPLACE");
          if (idx >= 0) {
            const prev = contracts[idx].address;
            contracts[idx] = { ...contracts[idx], address: envMarketplace };
            console.log(`✅ Overrode Marketplace address: ${prev} -> ${envMarketplace}`);
          }
        }

        // NOW initialize SDK with fixed config
        const initialized = await initSDK(constants.StarknetChainId.SN_MAIN);

        console.log('=== MARKETPLACE SDK INITIALIZED ===');
        console.log('Torii URL:', config?.toriiUrl);
        console.log('World Address:', config?.manifest?.world?.address);
        console.log('Marketplace Address:', (() => {
          try {
            const list = (config?.manifest as any)?.contracts ?? [];
            const entry = Array.isArray(list) ? list.find((c: any) => (c?.tag || "").toUpperCase() === "MARKETPLACE-MARKETPLACE") : null;
            return entry?.address ?? 'unknown';
          } catch { return 'unknown'; }
        })());

        if (!cancelled) {
          setSdk(initialized);
        }
      } catch (error) {
        console.error("❌ Failed to initialise marketplace SDK", error);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!sdk) {
    return null;
  }

  // Use the same config instance that was fixed during SDK init
  const dojoConfig = configs[constants.StarknetChainId.SN_MAIN];

  console.log('DojoSdkProvider using Torii URL:', dojoConfig.toriiUrl);

  return (
    <QueryClientProvider client={queryClient}>
      <DojoSdkProvider
        dojoConfig={dojoConfig}
        sdk={sdk}
        clientFn={() => {
          console.log('Creating ToriiClient with URL:', dojoConfig.toriiUrl);
          return new ToriiClient({
            toriiUrl: dojoConfig.toriiUrl,
            worldAddress: dojoConfig.manifest.world.address,
          });
        }}
      >
        <ArcadeProvider>
          <MarketplaceContextProvider>{children}</MarketplaceContextProvider>
        </ArcadeProvider>
      </DojoSdkProvider>
    </QueryClientProvider>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <MarketplaceProviders>
        <App />
      </MarketplaceProviders>
    </BrowserRouter>
  </StrictMode>
);

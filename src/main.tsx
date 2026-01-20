import { StrictMode, useEffect, useState, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { DojoSdkProvider } from "@dojoengine/sdk/react";
import { ArcadeProvider, MarketplaceContextProvider, configs, initSDK } from "@cartridge/marketplace";
import { ToriiClient } from "@dojoengine/torii-wasm";
import { constants } from "starknet";

import "./index.css";
import App from "./App.tsx";
import { apiCache } from "./services/apiCache";
import { installFetchPatch, patchSdkConfig, logSdkConfig } from "./config";

// Install fetch URL rewrite patch early (fixes broken Cartridge SDK endpoints)
installFetchPatch();

// Expose apiCache in dev mode for debugging
if (import.meta.env.DEV) {
  (window as any).apiCache = apiCache;
}

const queryClient = new QueryClient();

type MarketplaceSDK = Awaited<ReturnType<typeof initSDK>>;

function MarketplaceProviders({ children }: { children: ReactNode }) {
  const [sdk, setSdk] = useState<MarketplaceSDK | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        // Patch SDK config before initialization
        const config = patchSdkConfig();

        // Initialize SDK with patched config
        const initialized = await initSDK(constants.StarknetChainId.SN_MAIN);

        logSdkConfig(config);

        if (!cancelled) {
          setSdk(initialized);
        }
      } catch (error) {
        console.error("[SDK] Failed to initialize:", error);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  if (!sdk) {
    return null;
  }

  const dojoConfig = configs[constants.StarknetChainId.SN_MAIN];

  return (
    <QueryClientProvider client={queryClient}>
      <DojoSdkProvider
        dojoConfig={dojoConfig}
        sdk={sdk as any}
        clientFn={() =>
          new ToriiClient({
            toriiUrl: dojoConfig.toriiUrl,
            worldAddress: dojoConfig.manifest.world.address,
          })
        }
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

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

const queryClient = new QueryClient();

type MarketplaceSDK = Awaited<ReturnType<typeof initSDK>>;

function MarketplaceProviders({ children }: { children: ReactNode }) {
  const [sdk, setSdk] = useState<MarketplaceSDK | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const initialized = await initSDK(constants.StarknetChainId.SN_MAIN);
        if (!cancelled) {
          setSdk(initialized);
        }
      } catch (error) {
        console.error("Failed to initialise marketplace SDK", error);
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
        sdk={sdk}
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

import { lazy, Suspense } from "react";
import { Route, Routes } from "react-router-dom";
import {
  jsonRpcProvider,
  StarknetConfig,
  voyager,
} from "@starknet-react/core";
import { mainnet, type Chain } from "@starknet-react/chains";
import { connectors } from "./wallet/controller";
import ErrorBoundary from "./components/common/ErrorBoundary";
import { GlobalSearchProvider } from "./hooks/useGlobalSearch";
import { GlobalCartProvider } from "./contexts/GlobalCartContext";
import { FloatingCarts } from "./components/marketplace/FloatingCarts";
import { Toaster } from "sonner";

// Lazy load pages for better performance
const HomePage = lazy(() => import("./pages/HomePage"));
const BeastDetailPage = lazy(() => import("./pages/BeastDetailPage"));
const AccountPage = lazy(() => import("./pages/AccountPage"));
const ProfilePage = lazy(() => import("./pages/ProfilePage"));
const CollectionPage = lazy(() => import("./pages/CollectionPage"));
const LeaderboardPage = lazy(() => import("./pages/LeaderboardPage"));
const MarketplacePage = lazy(() => import("./pages/MarketplacePage"));

const provider = jsonRpcProvider({
  rpc: (chain: Chain) => {
    switch (chain) {
      case mainnet:
        return {
          nodeUrl: mainnet.rpcUrls.cartridge.http[0],
        };
      default:
        throw new Error(`Unsupported chain: ${chain.network}`);
    }
  },
});

function App() {
  return (
    <StarknetConfig
      chains={[mainnet]}
      provider={provider}
      connectors={connectors}
      explorer={voyager}
      autoConnect
    >
      <GlobalSearchProvider>
        <GlobalCartProvider>
          <ErrorBoundary>
            <Toaster
              position="top-right"
              expand={false}
              toastOptions={{
                className: "!bg-black/90 !backdrop-blur-md !border !border-gray-700 !text-white !shadow-xl",
                style: {
                  background: "rgba(0, 0, 0, 0.9)",
                  backdropFilter: "blur(12px)",
                  border: "1px solid rgba(75, 85, 99, 0.5)",
                },
                classNames: {
                  success: "!border-green-500/50 !text-green-300",
                  error: "!border-red-500/50 !text-red-300",
                  warning: "!border-yellow-500/50 !text-yellow-300",
                  info: "!border-lsGold/50 !text-lsGold",
                  loading: "!border-gray-500/50 !text-gray-300",
                },
              }}
            />
            <Suspense
              fallback={
                <div className="flex items-center justify-center min-h-screen">
                  <div className="text-center">
                    <div className="animate-spin h-8 w-8 border-4 border-lsGreen border-t-transparent rounded-full mx-auto mb-4"></div>
                    <p className="text-gray-400">Loading...</p>
                  </div>
                </div>
              }
            >
              <Routes>
                <Route path="/" element={<HomePage />} />
                <Route path="/beasts/:tokenId" element={<BeastDetailPage />} />
                <Route path="/account/:identifier" element={<AccountPage />} />
                <Route path="/collection/:identifier" element={<CollectionPage />} />
                <Route path="/profile" element={<ProfilePage />} />
                <Route path="/leaderboard" element={<LeaderboardPage />} />
                <Route path="/marketplace" element={<MarketplacePage />} />
              </Routes>
              {/* Global floating carts - callbacks provided by MarketplacePage when on that route */}
              <FloatingCarts />
            </Suspense>
          </ErrorBoundary>
        </GlobalCartProvider>
      </GlobalSearchProvider>
    </StarknetConfig>
  );
}

export default App;

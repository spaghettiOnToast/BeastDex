import { lazy, Suspense } from "react";
import { Route, Routes } from "react-router-dom";
import {
  jsonRpcProvider,
  StarknetConfig,
  voyager,
} from "@starknet-react/core";
import { mainnet, type Chain } from "@starknet-react/chains";
import { connectors } from "./wallet/controller";
import ErrorBoundary from "./components/ErrorBoundary";
import { GlobalSearchProvider } from "./hooks/useGlobalSearch";
import { TradeBuilderProvider } from "./contexts/TradeBuilderContext";

// Lazy load pages for better performance
const HomePage = lazy(() => import("./pages/HomePage"));
const BeastDetailPage = lazy(() => import("./pages/BeastDetailPage"));
const AccountPage = lazy(() => import("./pages/AccountPage"));
const ProfilePage = lazy(() => import("./pages/ProfilePage"));
const CollectionPage = lazy(() => import("./pages/CollectionPage"));
const LeaderboardPage = lazy(() => import("./pages/LeaderboardPage"));
const TradePage = lazy(() => import("./pages/TradePage"));

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
        <TradeBuilderProvider>
          <ErrorBoundary>
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
            <Route path="/trades" element={<TradePage />} />
            <Route path="/trade/:id" element={<TradePage />} />
          </Routes>
        </Suspense>
          </ErrorBoundary>
        </TradeBuilderProvider>
      </GlobalSearchProvider>
    </StarknetConfig>
  );
}

export default App;

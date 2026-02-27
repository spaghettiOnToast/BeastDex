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
import { TermsOfServiceProvider } from "./contexts/TermsOfServiceContext";
import { SoldListingsProvider } from "./contexts/SoldListingsContext";
import { FloatingCarts } from "./components/marketplace/FloatingCarts";
import { GlobalCartDialogs } from "./components/marketplace/GlobalCartDialogs";
import { TermsOfServiceDialog } from "./components/legal/TermsOfServiceDialog";
import { Toaster } from "sonner";
import { Analytics } from "@vercel/analytics/react";

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
          <SoldListingsProvider>
          <TermsOfServiceProvider>
          <ErrorBoundary>
            <Toaster
              position="top-right"
              expand={false}
              toastOptions={{
                className: "!bg-surface-overlay/95 !backdrop-blur-xl !border !border-white/[0.06] !text-white !shadow-xl",
                style: {
                  background: "rgba(24, 24, 27, 0.95)",
                  backdropFilter: "blur(16px)",
                  border: "1px solid rgba(255, 255, 255, 0.06)",
                },
                classNames: {
                  success: "!border-accent/30 !text-green-300",
                  error: "!border-red-500/30 !text-red-300",
                  warning: "!border-yellow-500/30 !text-yellow-300",
                  info: "!border-gold/30 !text-gold",
                  loading: "!border-white/10 !text-zinc-300",
                },
              }}
            />
            <Suspense
              fallback={
                <div className="flex items-center justify-center min-h-screen">
                  <div className="text-center">
                    <div className="animate-spin h-8 w-8 border-4 border-accent border-t-transparent rounded-full mx-auto mb-4"></div>
                    <p className="text-zinc-400">Loading...</p>
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
                <Route path="/statistics" element={<LeaderboardPage />} />
                <Route path="/marketplace" element={<MarketplacePage />} />
              </Routes>
              {/* Global floating carts and dialogs */}
              <FloatingCarts />
              <GlobalCartDialogs />
            </Suspense>
            {/* Terms of Service dialog */}
            <TermsOfServiceDialog />
            <Analytics />
          </ErrorBoundary>
          </TermsOfServiceProvider>
          </SoldListingsProvider>
        </GlobalCartProvider>
      </GlobalSearchProvider>
    </StarknetConfig>
  );
}

export default App;

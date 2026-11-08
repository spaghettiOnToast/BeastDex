import { useEffect } from "react";
import { useAccount } from "@starknet-react/core";
import { Link, useNavigate } from "react-router-dom";
import { AppLayout } from "../components/layout/AppLayout";
import TopBar from "../components/header/TopBar";

/**
 * `/collection` with no address: go to the connected wallet's collection, or
 * ask to connect. Waits for a reconnecting wallet instead of bouncing home, so
 * the header's Collection link works before the session has restored.
 */
function CollectionIndexPage() {
  const { address, status } = useAccount();
  const navigate = useNavigate();

  useEffect(() => {
    if (address) navigate(`/collection/${address}`, { replace: true });
  }, [address, navigate]);

  const connecting = status === "connecting" || status === "reconnecting";

  return (
    <AppLayout topBar={<TopBar />}>
      <div className="flex min-h-[50vh] items-center justify-center px-4">
        <div className="max-w-sm space-y-3 rounded-xl border border-white/[0.06] bg-surface-raised/70 p-6 text-center">
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-500">Collection</p>
          {connecting ? (
            <p className="text-sm text-zinc-300">Reconnecting your wallet…</p>
          ) : (
            <>
              <p className="text-sm text-zinc-200">Connect a wallet to see your collection.</p>
              <p className="text-xs text-zinc-500">
                Use <span className="font-semibold text-zinc-300">Connect</span> in the header, or search for a player
                or address to view theirs.
              </p>
            </>
          )}
          <Link to="/" className="inline-block text-xs text-gold hover:underline">
            ← Back to Home
          </Link>
        </div>
      </div>
    </AppLayout>
  );
}

export default CollectionIndexPage;

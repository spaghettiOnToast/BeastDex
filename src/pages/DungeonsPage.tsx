import { useEffect, useState, useMemo, useCallback } from "react";
import { Link } from "react-router-dom";
import { useAccount, useConnect, useDisconnect } from "@starknet-react/core";
import { ControllerConnector } from "@cartridge/connector";
import TopBar from "../components/header/TopBar";
import { AppLayout } from "../components/layout/AppLayout";
import { Button } from "../components/ui/button";
import { Wallet, Sword, CheckCircle2 } from "lucide-react";
import { controllerConnector } from "../wallet/controller";
import { useTermsOfService } from "../contexts/TermsOfServiceContext";
import {
  fetchTiddyMunTotalSupply,
  fetchTiddyMunMeta,
  fetchTiddyMunTokenIdForOwner,
  type TiddyMunMeta,
} from "../services/tiddyMun";

function DungeonsPage() {
  const { address } = useAccount();
  const { connectAsync, connectors } = useConnect();
  const { disconnectAsync } = useDisconnect();
  const { promptToSAcceptance, hasAcceptedToS } = useTermsOfService();
  const [username, setUsername] = useState<string | null>(null);
  const [tokens, setTokens] = useState<(TiddyMunMeta | null)[]>([]);
  const [totalSupply, setTotalSupply] = useState<number | null>(null);
  const [ownedTokenId, setOwnedTokenId] = useState<bigint | null | undefined>(undefined);

  const activeConnector = useMemo(
    () => connectors.find((c) => c.id === controllerConnector.id) ?? controllerConnector,
    [connectors]
  );

  // Load all tokens on mount
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const supply = await fetchTiddyMunTotalSupply();
      if (cancelled) return;
      setTotalSupply(supply);
      const metas = await Promise.all(
        Array.from({ length: supply }, (_, i) => fetchTiddyMunMeta(BigInt(i + 1)))
      );
      if (!cancelled) setTokens(metas);
    })().catch(() => {});
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function fetchUsername() {
      if (!address) { setUsername(null); return; }
      try {
        const profile = (activeConnector as any).controller?.profile;
        const name = profile?.username ?? profile?.controller?.username ?? profile?.handle ?? null;
        const resolved = name ?? (await (activeConnector as ControllerConnector).username?.()) ?? null;
        if (!cancelled) setUsername(resolved);
      } catch {
        if (!cancelled) setUsername(null);
      }
    }
    fetchUsername();
    return () => { cancelled = true; };
  }, [address, activeConnector]);

  useEffect(() => {
    if (address && username && !hasAcceptedToS) {
      promptToSAcceptance(async () => {
        try { await disconnectAsync(); await (activeConnector as any).disconnect?.(); } catch {}
        setUsername(null);
      });
    }
  }, [address, username, hasAcceptedToS, promptToSAcceptance, disconnectAsync, activeConnector]);

  // Check which token the connected wallet owns
  useEffect(() => {
    if (!address) { setOwnedTokenId(undefined); return; }
    let cancelled = false;
    fetchTiddyMunTokenIdForOwner(address)
      .then((id) => { if (!cancelled) setOwnedTokenId(id); })
      .catch(() => { if (!cancelled) setOwnedTokenId(null); });
    return () => { cancelled = true; };
  }, [address]);

  const handleConnect = useCallback(async () => {
    try {
      await connectAsync({ connector: activeConnector as any });
      const name = await (activeConnector as ControllerConnector).username?.();
      setUsername(name ?? null);
      promptToSAcceptance(async () => {
        await disconnectAsync();
        await (activeConnector as any).disconnect?.();
        setUsername(null);
      });
    } catch (error) {
      console.error("Failed to connect wallet", error);
    }
  }, [connectAsync, activeConnector, disconnectAsync, promptToSAcceptance]);

  return (
    <AppLayout topBar={<TopBar />}>
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-amber-900/40 border border-amber-700/40">
            <Sword className="h-5 w-5 text-amber-400" />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-amber-500/80">Dungeons</p>
            <h1 className="text-2xl sm:text-3xl font-bold text-white leading-tight">
              Norwich Game Festival
            </h1>
          </div>
        </div>
        <p className="text-zinc-400 text-sm max-w-xl mt-2">
          Exclusive beasts collected at the Norwich Game Festival. Connect your wallet to see if you claimed yours.
        </p>
        {totalSupply !== null && (
          <p className="mt-2 text-sm text-amber-400/80">
            <span className="font-semibold text-amber-400">{totalSupply}</span>{" "}
            beast{totalSupply !== 1 ? "s" : ""} collected so far
          </p>
        )}
        <div className="mt-4 h-px bg-gradient-to-r from-amber-700/30 via-amber-600/10 to-transparent" />
      </div>

      {/* Connect prompt — only when not connected */}
      {!address && (
        <div className="flex items-center gap-4 mb-8 px-4 py-3 rounded-xl border border-amber-700/20 bg-amber-900/10">
          <Wallet className="h-5 w-5 text-amber-400/70 flex-shrink-0" />
          <p className="text-sm text-zinc-400 flex-1">Connect your wallet to see if you collected a beast.</p>
          <Button
            onClick={handleConnect}
            size="sm"
            className="text-xs font-semibold uppercase tracking-wide border-lsGold text-lsGold hover:bg-gray-900 hover:text-lsGold h-8 px-4 flex-shrink-0"
            variant="outline"
          >
            Connect
          </Button>
        </div>
      )}

      {/* Token grid */}
      {tokens.length === 0 && totalSupply === null && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="rounded-2xl border border-white/[0.06] bg-white/[0.02] aspect-square animate-pulse" />
          ))}
        </div>
      )}

      {tokens.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {tokens.map((meta, i) => {
            const tokenId = BigInt(i + 1);
            const isOwned = ownedTokenId !== undefined && ownedTokenId === tokenId;
            return (
              <Link
                key={i}
                to={`/dungeons/${i + 1}`}
                className="group rounded-2xl border border-white/[0.06] bg-[#111] overflow-hidden hover:border-amber-700/40 transition-colors"
              >
                <div className="relative bg-black">
                  {meta?.image ? (
                    <img
                      src={meta.image}
                      alt={meta?.name ?? "Tiddy Mun"}
                      className="w-full"
                      style={{ imageRendering: "pixelated" }}
                    />
                  ) : (
                    <div className="aspect-square animate-pulse bg-zinc-900" />
                  )}
                  {isOwned && (
                    <div className="absolute top-2 right-2 flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-900/80 border border-emerald-600/40 backdrop-blur-sm">
                      <CheckCircle2 className="h-3 w-3 text-emerald-400" />
                      <span className="text-[10px] font-semibold text-emerald-300">Yours</span>
                    </div>
                  )}
                </div>
                <div className="px-3 py-2 border-t border-white/[0.06]">
                  <p className="text-[10px] text-zinc-500 font-mono">#{i + 1}</p>
                  <p className="text-xs font-semibold text-white truncate group-hover:text-amber-400 transition-colors">
                    {meta?.name ?? "Tiddy Mun"}
                  </p>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </AppLayout>
  );
}

export default DungeonsPage;

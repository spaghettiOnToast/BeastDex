import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import TopBar from "../components/header/TopBar";
import { AppLayout } from "../components/layout/AppLayout";
import CometCard from "../components/ui/CometCard";
import { useControllerUsernames } from "../hooks/useControllerUsernames";
import { normaliseStarknetAddress } from "../utils/address";
import { fetchTiddyMunMeta, fetchTiddyMunOwner, type TiddyMunMeta } from "../services/tiddyMun";

const BOOLEAN_ATTRS = new Set(["shiny", "animated", "genesis"]);

const getAttributeStyle = (trait: string) => {
  const t = trait.toLowerCase();
  if (t === "level") return { bg: "bg-blue-500/10", border: "border-blue-500/30", text: "text-blue-300" };
  if (t === "health") return { bg: "bg-pink-500/10", border: "border-pink-500/30", text: "text-pink-300" };
  if (t === "prefix" || t === "suffix") return { bg: "bg-cyan-500/10", border: "border-cyan-500/30", text: "text-cyan-300" };
  if (t === "beast id") return { bg: "bg-yellow-500/10", border: "border-yellow-500/30", text: "text-yellow-300" };
  if (BOOLEAN_ATTRS.has(t)) return { bg: "bg-emerald-500/10", border: "border-emerald-500/30", text: "text-emerald-300" };
  return { bg: "bg-white/[0.06]", border: "border-white/[0.08]", text: "text-zinc-300" };
};

function TiddyMunDetailPage() {
  const { tokenId: tokenIdParam } = useParams<{ tokenId: string }>();
  const tokenId = tokenIdParam ? BigInt(tokenIdParam) : null;

  const [meta, setMeta] = useState<TiddyMunMeta | null>(null);
  const [owner, setOwner] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!tokenId) { setError("Token not found"); setLoading(false); return; }
    let cancelled = false;
    setLoading(true);
    setError(null);

    Promise.all([fetchTiddyMunMeta(tokenId), fetchTiddyMunOwner(tokenId)])
      .then(([m, o]) => {
        if (cancelled) return;
        if (!m) { setError("Token not found"); return; }
        setMeta(m);
        setOwner(o);
      })
      .catch(() => { if (!cancelled) setError("Failed to load token"); })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [tokenId?.toString()]);

  const ownerLookupAddresses = useMemo(
    () => (owner ? [owner] : [] as Array<string | null>),
    [owner]
  );
  const { usernames } = useControllerUsernames(ownerLookupAddresses, { delayMs: 200 });
  const normalizedOwner = owner ? normaliseStarknetAddress(owner) : null;
  const ownerUsername = normalizedOwner ? usernames[normalizedOwner] ?? null : null;
  const ownerLabel = ownerUsername
    ? ownerUsername
    : owner
    ? `${owner.slice(0, 6)}…${owner.slice(-4)}`
    : null;

  const nameParts = meta?.name.match(/^"([^"]+)"\s+(.+)$/);
  const namePrefix = nameParts?.[1] ?? null;
  const nameBase = nameParts ? nameParts[2] : (meta?.name ?? "Tiddy Mun");

  const topBar = <TopBar />;

  if (loading) {
    return (
      <AppLayout topBar={topBar}>
        <div className="flex min-h-[40vh] items-center justify-center text-amber-400 font-mono text-sm">
          Loading...
        </div>
      </AppLayout>
    );
  }

  if (error || !meta) {
    return (
      <AppLayout topBar={topBar}>
        <div className="flex flex-col items-center justify-center gap-4 py-20 text-white">
          <p className="text-sm text-red-400">{error ?? "Token not found"}</p>
          <Link
            to="/dungeons"
            className="inline-flex items-center justify-center rounded-md border border-amber-700 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-amber-400 transition hover:bg-amber-900/20"
          >
            ← Back to Dungeons
          </Link>
        </div>
      </AppLayout>
    );
  }

  const cardHeight = "h-[380px] sm:h-[420px] lg:h-[520px]";
  const cardWidth = "w-[280px] sm:w-[320px] lg:w-[380px]";

  return (
    <AppLayout topBar={topBar}>
      <div className="space-y-6">
        {/* Back link */}
        <Link
          to="/dungeons"
          className="inline-flex items-center gap-2 text-xs uppercase tracking-wide text-amber-500 hover:underline"
        >
          ← Back to Dungeons
        </Link>

        {/* Name header */}
        <div className="text-center">
          {namePrefix && (
            <p className="text-lg text-amber-400 font-medium">"{namePrefix}"</p>
          )}
          <h1 className="text-3xl font-bold text-white uppercase tracking-wide">{nameBase}</h1>
          <p className="text-xs text-zinc-500 mt-1 font-mono">Token #{tokenId?.toString()}</p>
        </div>

        {/* Image + Attributes */}
        <div className="flex flex-col lg:flex-row gap-4 lg:gap-28 justify-center items-start">
          {/* Image */}
          <div className={`${cardWidth} ${cardHeight} flex-shrink-0`}>
            <CometCard>
              {meta.image ? (
                <img
                  src={meta.image}
                  alt={meta.name}
                  className="block h-full w-full object-contain"
                  style={{ imageRendering: "pixelated" }}
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center bg-surface/70 text-zinc-600 text-xs">
                  No image
                </div>
              )}
            </CometCard>
          </div>

          {/* Attributes panel */}
          <div className={`${cardWidth} flex flex-col gap-2 flex-shrink-0`}>
            <div className="h-[370px] sm:h-[410px] lg:h-[510px] rounded-xl border border-white/[0.06] bg-surface/60 overflow-y-auto">
              <div className="flex-shrink-0 px-3 py-2 border-b border-white/[0.06] bg-surface/30 sticky top-0">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold text-amber-400 uppercase tracking-wider">Attributes</span>
                  <span className="text-[9px] text-zinc-500">{meta.attributes.length}</span>
                </div>
              </div>
              <div className="p-2">
                {meta.attributes.length > 0 ? (
                  <div className="grid grid-cols-2 gap-1.5">
                    {meta.attributes.map((attr, idx) => {
                      const style = getAttributeStyle(attr.trait_type);
                      const displayValue = BOOLEAN_ATTRS.has(attr.trait_type.toLowerCase())
                        ? attr.value === "true" || attr.value === 1 ? "Yes" : "No"
                        : String(attr.value);
                      return (
                        <div
                          key={`${attr.trait_type}-${idx}`}
                          className={`rounded border ${style.border} ${style.bg} px-2 py-1.5`}
                        >
                          <p className="text-[8px] uppercase tracking-wide text-zinc-500 font-medium">
                            {attr.trait_type}
                          </p>
                          <p className={`text-[11px] font-bold ${style.text} truncate`}>
                            {displayValue}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="flex h-full items-center justify-center pt-8">
                    <p className="text-[10px] text-zinc-500">No attributes</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Owner footer */}
        {ownerLabel && (
          <div className="pt-2 border-t border-white/[0.06]">
            <div className="rounded-lg border border-white/[0.06] bg-surface/40 px-4 py-2.5 text-sm text-zinc-400 inline-block">
              Owned by{" "}
              <Link
                to={`/collection/${encodeURIComponent(ownerUsername ?? owner ?? "")}`}
                className="text-amber-400 font-medium hover:underline"
              >
                {ownerLabel}
              </Link>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}

export default TiddyMunDetailPage;

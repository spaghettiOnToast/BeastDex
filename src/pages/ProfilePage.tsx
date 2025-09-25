import { useCallback, useEffect, useMemo, useState } from "react";
import { useAccount } from "@starknet-react/core";
import { Link, useLocation, useNavigate } from "react-router-dom";
import TopBar from "../components/header/TopBar";
import { AppLayout } from "../components/layout/AppLayout";
import BeastGrid from "../components/beast/BeastGrid";
import BeastModal from "../components/beast/BeastModal";
import { useControllerUsernames } from "../hooks/useControllerUsernames";
import {
  fetchBeasts,
  fetchAdventurerDeaths,
  fetchBeastPowerRank,
  type Beast,
  type BeastPowerRank,
} from "../services/beast";
import {
  calculateKdRatio,
  calculateTotalPower,
  computeBeastCollectionStats,
} from "../utils/beastCollection";
import { normaliseStarknetAddress } from "../utils/address";

import { ThreeColumnStatsLayout } from "../components/layout/ThreeColumnStatsLayout";
import type { OverviewCard } from "@/components/account/OverviewCards";

const PAGE_SIZE = 50;

function ProfilePage() {
  const { address } = useAccount();
  const location = useLocation();
  const navigate = useNavigate();
  const [selectedBeastId, setSelectedBeastId] = useState<string | null>(null);
  const [beasts, setBeasts] = useState<Beast[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deaths, setDeaths] = useState(0);
  const [powerRanking, setPowerRanking] = useState<BeastPowerRank | null>(null);

  const ownerAddress = useMemo(() => address ?? "", [address]);

  const loadBeasts = useCallback(async () => {
    if (!ownerAddress) {
      setBeasts([]);
      setTotal(0);
      setLoading(false);
      setError(null);
      setDeaths(0);
      setPowerRanking(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const limit = PAGE_SIZE;
      let page = 1;
      let accumulated: Beast[] = [];
      let totalCount = 0;
      while (true) {
        const { beasts: batch, total } = await fetchBeasts({
          limit,
          page,
          ownerAddresses: [ownerAddress],
          sort: "default",
        });
        accumulated = accumulated.concat(batch);
        totalCount = total;
        if (accumulated.length >= total || batch.length < limit) {
          break;
        }
        page += 1;
      }
      setBeasts(accumulated);
      setTotal(totalCount || accumulated.length);

      const [deathCount, ranking] = await Promise.all([
        fetchAdventurerDeaths(ownerAddress),
        fetchBeastPowerRank(ownerAddress).catch((rankError) => {
          console.error("Failed to fetch beast power rank", rankError);
          return null;
        }),
      ]);

      setDeaths(deathCount);
      setPowerRanking(ranking);
    } catch (err: unknown) {
      console.error("Failed to load profile beasts", err);
      setError((err as Error)?.message ?? "Failed to load beasts");
    } finally {
      setLoading(false);
    }
  }, [ownerAddress]);

  const ownerLookupAddresses = useMemo(
    () => beasts.map((beast) => beast.owner).filter(Boolean),
    [beasts]
  );

  const {
    usernames: ownerUsernames,
    loading: usernamesLoading,
    error: usernamesError,
  } = useControllerUsernames(ownerLookupAddresses);

  const selectedBeast = useMemo(
    () => beasts.find((beast) => beast.id === selectedBeastId) ?? null,
    [beasts, selectedBeastId]
  );

  useEffect(() => {
    loadBeasts();
  }, [loadBeasts]);

  const reload = useCallback(() => {
    loadBeasts();
  }, [loadBeasts]);

  const handleBackToHome = useCallback(() => {
    navigate("/");
  }, [navigate]);

  const stats = useMemo(() => computeBeastCollectionStats(beasts), [beasts]);
  const totalPower = useMemo(() => calculateTotalPower(beasts), [beasts]);

  const visibleBeasts = beasts;

  const kdRatio = useMemo(
    () => calculateKdRatio(total, deaths),
    [deaths, total]
  );

  const topBar = <TopBar />;

  const rankDisplay =
    powerRanking?.rank != null ? `#${powerRanking.rank.toLocaleString()}` : "—";
  const rankSubheading = powerRanking?.totalOwners
    ? `of ${powerRanking.totalOwners.toLocaleString()}`
    : "";

  const overviewCards: OverviewCard[] = useMemo(
    () => [
      {
        key: "kd",
        icon: "⚔️",
        label: "K:D Ratio",
        value: kdRatio,
        sub: `${total.toLocaleString()} K / ${deaths.toLocaleString()} D`,
      },
      {
        key: "beasts",
        icon: "🐾",
        label: "Beasts Collected",
        value: total.toLocaleString(),
      },
      {
        key: "power",
        icon: "🔮",
        label: "Combined Power",
        value: totalPower.toLocaleString(),
      },
      {
        key: "rank",
        icon: "🏆",
        label: "Power Rank",
        value: rankDisplay,
        sub: rankSubheading || "Global leaderboard",
      },
    ],
    [deaths, kdRatio, rankDisplay, rankSubheading, total, totalPower]
  );

  const displayTitle = useMemo(() => {
    if (stats.mostPowerfulTitle) return stats.mostPowerfulTitle;
    const name = stats.mostPowerful?.name?.trim();
    if (!name) return null;
    const quotedMatch = name.match(/"([^"]+)"/);
    if (quotedMatch?.[1]) return quotedMatch[1];
    const parts = name.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) return `${parts[0]} ${parts[1]}`;
    if (parts.length === 1) return parts[0];
    return null;
  }, [stats.mostPowerful, stats.mostPowerfulTitle]);

  const normalisedAccountAddress = useMemo(
    () => (address ? normaliseStarknetAddress(address) ?? address : ""),
    [address]
  );

  const profileUsername = useMemo(() => {
    if (!normalisedAccountAddress) return null;
    const key = normalisedAccountAddress.toLowerCase();
    return ownerUsernames[key] ?? null;
  }, [normalisedAccountAddress, ownerUsernames]);

  const displayName = useMemo(() => {
    if (profileUsername) return profileUsername;
    if (!normalisedAccountAddress) return "Unknown";
    if (normalisedAccountAddress.length <= 12) return normalisedAccountAddress;
    return `${normalisedAccountAddress.slice(
      0,
      6
    )}…${normalisedAccountAddress.slice(-4)}`;
  }, [normalisedAccountAddress, profileUsername]);

  const displayNameClass = profileUsername ? "" : "font-mono";

  const collectionIdentifier = useMemo(() => {
    if (profileUsername) {
      return profileUsername.trim().toLowerCase();
    }
    return normalisedAccountAddress;
  }, [normalisedAccountAddress, profileUsername]);

  if (!address) {
    return (
      <AppLayout topBar={topBar}>
        <div className="flex min-h-[40vh] flex-col items-center justify-center gap-2 text-sm text-gray-400">
          <p>Please connect your wallet to view your profile.</p>
          <button
            type="button"
            onClick={() =>
              navigate("/", { state: { from: location.pathname } })
            }
            className="rounded-md bg-lsGreen px-4 py-2 text-xs font-semibold uppercase tracking-wide text-black hover:opacity-80"
          >
            Go to Homepage
          </button>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout topBar={topBar}>
      <div className="flex flex-col gap-6">
        {/* Title */}
        <div className="flex flex-col items-center text-center text-xs text-gray-400">
          {displayTitle ? (
            <p className="bg-gradient-to-r from-[#ff7cf7] via-[#7dfbff] to-[#8bff72] bg-clip-text text-3xl font-semibold uppercase tracking-[0.35em] text-transparent">
              "{displayTitle}"
            </p>
          ) : null}
          <span
            className="bg-gradient-to-r from-[#f9e08a] via-[#fbdc5e] to-[#39ff14] bg-clip-text text-4xl font-semibold uppercase tracking-[0.35em]"
            style={{ WebkitTextFillColor: "#fbeaa0" }}
          >
            <span className={`${displayNameClass} uppercase`}>
              {displayName}
            </span>
          </span>
          <p className="text-[11px] uppercase tracking-[0.2em] text-gray-500">
            Explore your BeastDex journey
          </p>
        </div>

        {/* Buttons row */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {collectionIdentifier ? (
              <Link
                to={`/collection/${encodeURIComponent(collectionIdentifier)}`}
                className="inline-flex items-center rounded-md border border-lsGold/30 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-lsGold hover:bg-gray-900"
              >
                View Beast Collection
              </Link>
            ) : null}
            <button
              type="button"
              onClick={() => reload()}
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-md border border-lsGold px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-lsGold hover:bg-gray-900 disabled:opacity-50"
            >
              {loading ? (
                <span className="h-3 w-3 animate-spin rounded-full border-2 border-lsGold border-t-transparent" />
              ) : null}
              <span>Refresh</span>
            </button>
          </div>
          <Link
            to="/"
            onClick={handleBackToHome}
            className="text-xs uppercase tracking-wide text-lsGold hover:underline"
          >
            ← Back to BeastDex
          </Link>
        </div>

        {/* Three Column Stats Layout */}
        <ThreeColumnStatsLayout
          collectionStats={stats}
          overviewCards={overviewCards}
        />

        {/* Status + errors */}
        {usernamesLoading ? (
          <p className="text-[11px] text-gray-400">Loading usernames...</p>
        ) : usernamesError ? (
          <p className="text-[11px] text-red-400">{usernamesError}</p>
        ) : null}
        {error ? <p className="text-xs text-red-400">❌ {error}</p> : null}

        {/* Grid */}
        <BeastGrid
          beasts={visibleBeasts}
          ownerUsernames={ownerUsernames}
          onSelect={(beast) => setSelectedBeastId(beast.id)}
          loading={loading}
          emptyMessage="No beasts collected yet."
        />

        {/* Modal */}
        <BeastModal
          beast={selectedBeast}
          ownerUsernames={ownerUsernames}
          onClose={() => setSelectedBeastId(null)}
        />
      </div>
    </AppLayout>
  );
}

export default ProfilePage;

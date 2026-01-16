import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import BeastDetailContent from "../components/beast/BeastDetailContent";
import { useControllerUsernames } from "../hooks/useControllerUsernames";
import { fetchBeastById, type Beast } from "../services/beast";
import { fetchSummitBeastData, type SummitBeastData } from "../services/summit";
import { getErrorMessage } from "../utils/error";
import TopBar from "../components/header/TopBar";
import { AppLayout } from "../components/layout/AppLayout";
import { normaliseStarknetAddress } from "../utils/address";

function BeastDetailPage() {
  const params = useParams<{ tokenId: string }>();
  const tokenId = params.tokenId
    ? decodeURIComponent(params.tokenId)
    : undefined;
  const [beast, setBeast] = useState<Beast | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [summitData, setSummitData] = useState<SummitBeastData | null>(null);
  const [summitLoading, setSummitLoading] = useState(true);

  const topBar = <TopBar />;

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!tokenId) {
        setError("Beast not found");
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError(null);
        const result = await fetchBeastById(tokenId);
        if (cancelled) return;
        if (!result) {
          setError("Beast not found");
          setBeast(null);
        } else {
          setBeast(result);
        }
      } catch (error: unknown) {
        if (cancelled) return;
        setError(getErrorMessage(error, "Failed to load beast details"));
        setBeast(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [tokenId]);

  // Fetch Summit data when beast is loaded
  useEffect(() => {
    let cancelled = false;

    async function loadSummitData() {
      if (!beast) {
        setSummitData(null);
        setSummitLoading(false);
        return;
      }

      try {
        setSummitLoading(true);
        const data = await fetchSummitBeastData(beast.numericId);
        if (cancelled) return;
        setSummitData(data);
      } catch (err) {
        console.error("Failed to load Summit data:", err);
        if (cancelled) return;
        setSummitData(null);
      } finally {
        if (!cancelled) setSummitLoading(false);
      }
    }

    loadSummitData();

    return () => {
      cancelled = true;
    };
  }, [beast]);

  const ownerLookupAddresses = useMemo(() => {
    if (!beast?.owner) return [] as Array<string | null>;
    return [beast.owner];
  }, [beast?.owner]);

  const {
    usernames: ownerUsernames,
    loading: ownerLookupLoading,
    error: ownerLookupError,
  } = useControllerUsernames(ownerLookupAddresses);

  const normalizedOwner = beast?.owner ? normaliseStarknetAddress(beast.owner) : null;
  const ownerUsername = normalizedOwner
    ? ownerUsernames[normalizedOwner] ?? null
    : null;

  if (loading) {
    return (
      <AppLayout topBar={topBar}>
        <div className="flex min-h-[40vh] items-center justify-center text-lsGold font-roboto">
          Loading beast details...
        </div>
      </AppLayout>
    );
  }

  if (error || !beast) {
    return (
      <AppLayout topBar={topBar}>
        <div className="flex flex-col items-center justify-center gap-4 py-20 text-white">
          <p className="text-sm text-red-400">{error ?? "Beast not found"}</p>
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md border border-lsGold px-4 py-2 text-xs font-semibold uppercase tracking-wide text-lsGold transition hover:bg-gray-900"
          >
            Back to Home
          </Link>
        </div>
      </AppLayout>
    );
  }

  // Extract beast name parts (prefix/suffix and beast type)
  const beastNameParts = beast.name.match(/^"([^"]+)"\s+(.+)$/);
  const beastPrefix = beastNameParts ? beastNameParts[1] : null;
  const beastType = beastNameParts ? beastNameParts[2] : beast.name;

  return (
    <AppLayout topBar={topBar}>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <Link
            to="/"
            className="inline-flex items-center gap-2 text-xs uppercase tracking-wide text-lsGold hover:underline"
          >
            ← Back to BeastDex
          </Link>
          {ownerLookupLoading ? (
            <span className="text-[11px] text-gray-400">
              Fetching owner username...
            </span>
          ) : ownerLookupError ? (
            <span className="text-[11px] text-red-400">{ownerLookupError}</span>
          ) : null}
        </div>

        {/* Beast Name Header */}
        <div className="text-center">
          {beastPrefix && (
            <p className="text-lg text-lsGold font-medium">"{beastPrefix}"</p>
          )}
          <h1 className="text-3xl font-bold text-white uppercase tracking-wide">
            {beastType}
          </h1>
          {summitData?.liveStats && (
            <div className="mt-2 inline-flex items-center gap-2 rounded-full bg-green-900/30 border border-green-500/30 px-3 py-1">
              <span className="text-xs font-semibold text-green-400 uppercase">Summit Active</span>
            </div>
          )}
        </div>

        <BeastDetailContent
          beast={beast}
          ownerUsername={ownerUsername}
          imageSize="detail"
          summitData={summitData}
          summitLoading={summitLoading}
        />
      </div>
    </AppLayout>
  );
}

export default BeastDetailPage;

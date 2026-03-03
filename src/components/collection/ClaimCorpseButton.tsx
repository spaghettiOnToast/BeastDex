import { useCallback, useEffect, useState } from "react";
import { Skull, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useAccount } from "@starknet-react/core";
import {
  fetchDeadAdventurers,
  buildClaimCalls,
  BATCH_LIMIT,
  type DeadAdventurer,
} from "../../services/corpse";
import { isUserRejection } from "../../utils/transaction";
import { compareStarknetAddresses } from "../../utils/address";

interface ClaimCorpseButtonProps {
  ownerAddress: string;
}

interface ClaimProgress {
  claimed: number;
  total: number;
}

export function ClaimCorpseButton({ ownerAddress }: ClaimCorpseButtonProps) {
  const { address: connectedAddress, account } = useAccount();

  const [adventurers, setAdventurers] = useState<DeadAdventurer[]>([]);
  const [loading, setLoading] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const [progress, setProgress] = useState<ClaimProgress | null>(null);
  const [fetched, setFetched] = useState(false);

  // Only show on own collection
  const isOwn =
    !!connectedAddress &&
    !!ownerAddress &&
    compareStarknetAddresses(connectedAddress, ownerAddress);

  const loadAdventurers = useCallback(async () => {
    if (!ownerAddress) return;
    setLoading(true);
    try {
      const dead = await fetchDeadAdventurers(ownerAddress);
      setAdventurers(dead);
    } catch (err) {
      console.error("[ClaimCorpse] Failed to fetch dead adventurers:", err);
    } finally {
      setLoading(false);
      setFetched(true);
    }
  }, [ownerAddress]);

  // Fetch when we detect this is the user's own collection
  useEffect(() => {
    if (isOwn && !fetched) {
      void loadAdventurers();
    }
  }, [isOwn, fetched, loadAdventurers]);

  // Reset when owner changes
  useEffect(() => {
    setAdventurers([]);
    setFetched(false);
  }, [ownerAddress]);

  // Don't render if not own collection or wallet not connected
  if (!isOwn || !account) return null;

  const totalCorpseTokens = adventurers.reduce(
    (sum, adv) => sum + adv.level,
    0,
  );

  const handleClaim = async () => {
    if (adventurers.length === 0 || claiming) return;

    const ids = adventurers.map((a) => a.id);
    const calls = buildClaimCalls(ids);
    const total = totalCorpseTokens;

    setClaiming(true);
    setProgress({ claimed: 0, total });

    try {
      let claimedSoFar = 0;

      for (let i = 0; i < calls.length; i++) {
        const batchStart = i * BATCH_LIMIT;
        const batchAdventurers = adventurers.slice(
          batchStart,
          batchStart + BATCH_LIMIT,
        );
        const batchTokens = batchAdventurers.reduce(
          (sum, adv) => sum + adv.level,
          0,
        );

        const result = await account.execute([calls[i]]);
        if (!result?.transaction_hash) {
          toast.error("Claim transaction failed");
          break;
        }

        claimedSoFar += batchTokens;
        setProgress({ claimed: claimedSoFar, total });
      }

      if (claimedSoFar === total) {
        toast.success(`Claimed ${total} CORPSE tokens!`);
        setAdventurers([]);
      }
    } catch (err) {
      if (isUserRejection(err)) {
        toast.info("Claim cancelled");
      } else {
        console.error("[ClaimCorpse] Claim failed:", err);
        toast.error("Failed to claim CORPSE tokens");
      }
    } finally {
      setClaiming(false);
      setProgress(null);
    }
  };

  if (loading) {
    return (
      <button
        type="button"
        disabled
        className="inline-flex items-center gap-2 rounded-lg border border-white/[0.06] px-3 py-1.5 text-xs font-medium text-zinc-400 disabled:opacity-50 transition-colors"
      >
        <Loader2 className="h-3 w-3 animate-spin" />
        <span>Checking corpses...</span>
      </button>
    );
  }

  if (adventurers.length === 0) return null;

  return (
    <button
      type="button"
      onClick={handleClaim}
      disabled={claiming}
      className="inline-flex items-center gap-2 rounded-lg border border-white/[0.06] px-3 py-1.5 text-xs font-medium text-zinc-400 hover:text-white hover:bg-white/[0.06] disabled:opacity-50 transition-colors"
      title={`Claim ${totalCorpseTokens} CORPSE tokens from ${adventurers.length} dead adventurers`}
    >
      {claiming ? (
        <Loader2 className="h-3 w-3 animate-spin" />
      ) : (
        <Skull className="h-3 w-3" />
      )}
      <span>
        {progress
          ? `Claiming ${progress.claimed}/${progress.total}`
          : `Claim ${totalCorpseTokens} CORPSE`}
      </span>
    </button>
  );
}

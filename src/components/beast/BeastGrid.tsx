import { memo } from "react";
import type { Beast } from "../../services/beast";
import BeastCard from "./BeastCard";
import BeastCardSkeleton from "./BeastCardSkeleton";
import { Alert, AlertDescription } from "../ui/alert";
import { normaliseStarknetAddress } from "../../utils/address";

type BeastGridProps = {
  beasts: Beast[];
  ownerUsernames: Record<string, string | undefined>;
  onSelect: (beast: Beast) => void;
  loading?: boolean;
  emptyMessage?: string;
};

export const BeastGrid = memo(function BeastGrid({
  beasts,
  ownerUsernames,
  onSelect,
  loading = false,
  emptyMessage = "No beasts found.",
}: BeastGridProps) {
  if (loading && beasts.length === 0) {
    return (
      <div className="grid grid-cols-2 xs:grid-cols-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-2 sm:gap-4 lg:gap-5 place-items-center">
        {[...Array(20)].map((_, i) => (
          <BeastCardSkeleton key={i} />
        ))}
      </div>
    );
  }

  if (!loading && beasts.length === 0) {
    return (
      <Alert className="max-w-md mx-auto mt-8 border-white/[0.06] bg-surface-raised">
        <AlertDescription className="text-center text-base text-zinc-400">
          {emptyMessage}
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="grid grid-cols-2 xs:grid-cols-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-2 sm:gap-4 lg:gap-5 animate-in fade-in duration-500">
      {beasts.map((beast) => {
        const normalizedOwner = beast.owner ? normaliseStarknetAddress(beast.owner) : null;
        return (
          <BeastCard
            key={beast.id}
            beast={beast}
            owned={!!beast.owner}
            ownerUsername={
              normalizedOwner
                ? ownerUsernames[normalizedOwner] ?? null
                : null
            }
            onSelect={onSelect}
          />
        );
      })}
    </div>
  );
});

export default BeastGrid;

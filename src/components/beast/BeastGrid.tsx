import { memo } from "react";
import type { Beast } from "../../services/beast";
import BeastCard from "../BeastCard";
import BeastCardSkeleton from "../BeastCardSkeleton";
import { Alert, AlertDescription } from "../ui/alert";

type BeastGridProps = {
  beasts: Beast[];
  ownerUsernames: Record<string, string | undefined>;
  onSelect: (beast: Beast) => void;
  loading?: boolean;
  emptyMessage?: string;
  loadingMessage?: string;
};

export const BeastGrid = memo(function BeastGrid({
  beasts,
  ownerUsernames,
  onSelect,
  loading = false,
  emptyMessage = "No beasts found.",
  loadingMessage = "Loading beasts...",
}: BeastGridProps) {
  if (loading && beasts.length === 0) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-6 place-items-center">
        {[...Array(20)].map((_, i) => (
          <BeastCardSkeleton key={i} />
        ))}
      </div>
    );
  }

  if (!loading && beasts.length === 0) {
    return (
      <Alert className="max-w-md mx-auto mt-8">
        <AlertDescription className="text-center text-base">
          {emptyMessage}
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-6 place-items-center animate-in fade-in duration-500">
      {beasts.map((beast) => (
        <BeastCard
          key={beast.id}
          beast={beast}
          owned={!!beast.owner}
          ownerUsername={
            beast.owner
              ? ownerUsernames[beast.owner.toLowerCase()] ?? null
              : null
          }
          onSelect={onSelect}
        />
      ))}
    </div>
  );
});

export default BeastGrid;

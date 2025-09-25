import { memo } from "react";
import type { Beast } from "../../services/beast";
import BeastCard from "../BeastCard";

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
      <div className="flex justify-center py-10 text-sm text-gray-400">
        {loadingMessage}
      </div>
    );
  }

  if (!loading && beasts.length === 0) {
    return (
      <p className="col-span-full text-center text-lsGold font-roboto">
        {emptyMessage}
      </p>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-8 justify-items-center">
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

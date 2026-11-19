import { memo } from "react";
import type { CollectionSet, SetCollectionStats } from "../../services/beast/setStats";
import { Alert, AlertDescription } from "../ui/alert";
import { SetCollectionPanel } from "./SetCollectionPanel";

type StatsPanelProps = {
  sets: SetCollectionStats[];
  loading: boolean;
  error?: string | null;
  activeSet?: CollectionSet;
  onActiveSetChange?: (set: CollectionSet) => void;
};

/** Home page collection progress: Originals and Loot Beasts. */
export const StatsPanel = memo(function StatsPanel({ sets, loading, error, activeSet, onActiveSetChange }: StatsPanelProps) {
  return (
    <div className="mb-4 sm:mb-6 space-y-3">
      <SetCollectionPanel sets={sets} loading={loading} active={activeSet} onActiveChange={onActiveSetChange} />
      {error ? (
        <Alert variant="destructive" className="bg-red-500/10 border-red-500/20">
          <AlertDescription className="text-xs sm:text-sm font-medium text-center">{error}</AlertDescription>
        </Alert>
      ) : null}
    </div>
  );
});

export default StatsPanel;

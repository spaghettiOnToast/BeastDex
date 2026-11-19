import { useEffect, useState } from "react";
import { fetchSetCollectionStats, type CollectionSet, type SetCollectionStats } from "../../services/beast/setStats";
import { SetCollectionPanel } from "../stats/SetCollectionPanel";
import { GradeBrowser } from "./GradeBrowser";
import { CollectionGlance } from "./CollectionGlance";
import { LootGlance } from "./LootBeastsStats";

/** Statistics → Collection Stats: every section follows the Originals / Loot Beasts toggle. */
export function BeastCollectionStats() {
  const [sets, setSets] = useState<SetCollectionStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState<CollectionSet>("original");

  useEffect(() => {
    let cancelled = false;
    fetchSetCollectionStats()
      .then((data) => !cancelled && setSets(data))
      .catch((err) => console.error("Failed to load collection stats:", err))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, []);

  const filters = sets.find((s) => s.set === active)?.filters;

  return (
    <div className="space-y-6">
      {/* Progress per set, then the selected set's visual tiles and tiers */}
      <SetCollectionPanel sets={sets} loading={loading} active={active} onActiveChange={setActive} />

      {filters && (
        <>
          {active === "loot" ? <LootGlance /> : <CollectionGlance filters={filters} title="Originals at a glance" />}
          {/* Browse the set's beasts by card grade (0-10); keyed so paging restarts per set */}
          <GradeBrowser key={active} filters={filters} />
        </>
      )}
    </div>
  );
}

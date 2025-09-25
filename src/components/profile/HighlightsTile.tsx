import type { Beast } from "../../services/beast";

type HighlightsTileProps = {
  mostPowerful?: Beast | null;
  rarest?: Beast | null;
  highestRanked?: Beast | null;
  lastBeastKilled?: Beast | null;
  lastBeastKilledName?: string | null;
};

export function HighlightsTile({
  mostPowerful,
  rarest,
  highestRanked,
  lastBeastKilled,
  lastBeastKilledName,
}: HighlightsTileProps) {
  const cards = [
    {
      key: "mostPowerful",
      label: "Most Powerful",
      value: mostPowerful ? mostPowerful.name : "Unknown",
    },
    {
      key: "rarest",
      label: "Rarest Beast",
      value: rarest ? rarest.name : "Unknown",
    },
    {
      key: "highestRanked",
      label: "Highest Rank",
      value: highestRanked ? highestRanked.name : "Unknown",
    },
    {
      key: "lastBeastKilled",
      label: "Last Beast Killed",
      value: lastBeastKilledName ?? lastBeastKilled?.name ?? "Unknown",
    },
  ];

  return (
    <div>
      <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-lsGold">
        Highlights
      </h3>

      {/* Grid of tiles */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((card) => (
          <div
            key={card.key}
            className="rounded-2xl border-2 bg-[#0b0b0f]/60 p-3"
            style={{
              borderImageSource:
                "linear-gradient(to right, rgb(208, 201, 141), #fbbf24, #39ff14)",
              borderImageSlice: 1,
            }}
          >
            <p className="text-[10px] uppercase tracking-wide text-gray-400 mb-1">
              {card.label}
            </p>
            <p className="text-sm text-[#f5d97c]">{card.value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

export default HighlightsTile;

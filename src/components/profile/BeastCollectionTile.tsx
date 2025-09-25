import { TOTAL_BEAST_VARIETIES } from "../../utils/beastCollection";

type BeastCollectionTileProps = {
  animatedShinyCount: number;
  animatedCount: number;
  shinyCount: number;
  standardCount: number;
  uniqueBeastTypes: number;
  uniqueAnimatedShinyTypes: number;
  uniqueAnimatedTypes: number;
  uniqueShinyTypes: number;
  uniqueStandardTypes: number;
};

export function BeastCollectionTile({
  animatedShinyCount,
  animatedCount,
  shinyCount,
  standardCount,
  uniqueBeastTypes,
  uniqueAnimatedShinyTypes,
  uniqueAnimatedTypes,
  uniqueShinyTypes,
  uniqueStandardTypes,
}: BeastCollectionTileProps) {
  const cards = [
    {
      key: "collected",
      label: "Beasts Collected",
      value: `${uniqueBeastTypes}/${TOTAL_BEAST_VARIETIES}`,
      color: "text-lsGold",
      border: "border-lsGold/40",
    },
    {
      key: "animatedShiny",
      label: "Animated Shiny",
      value: `${animatedShinyCount.toLocaleString()} (${uniqueAnimatedShinyTypes}/${TOTAL_BEAST_VARIETIES})`,
      color:
        "bg-gradient-to-r from-pink-400 via-purple-400 to-blue-400 bg-clip-text text-transparent",
      border: "border-pink-400/40",
    },
    {
      key: "animated",
      label: "Animated",
      value: `${animatedCount.toLocaleString()} (${uniqueAnimatedTypes}/${TOTAL_BEAST_VARIETIES})`,
      color: "text-sky-300",
      border: "border-sky-400/40",
    },
    {
      key: "shiny",
      label: "Shiny",
      value: `${shinyCount.toLocaleString()} (${uniqueShinyTypes}/${TOTAL_BEAST_VARIETIES})`,
      color: "text-yellow-300",
      border: "border-yellow-300/40",
    },
    {
      key: "standard",
      label: "Standard",
      value: `${standardCount.toLocaleString()} (${uniqueStandardTypes}/${TOTAL_BEAST_VARIETIES})`,
      color: "text-lsGreen",
      border: "border-lsGreen/40",
    },
  ];

  return (
    <div>
      <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-lsGold">
        Beast Collection
      </h3>

      {/* Unified square tiles like Highlights */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {cards.map((card) => (
          <div
            key={card.key}
            className={`rounded-xl border bg-[#0b0b0f]/60 p-3 ${card.border}`}
          >
            <p className="text-[10px] uppercase tracking-wide text-gray-400 mb-1">
              {card.label}
            </p>
            <p className={`text-sm font-semibold ${card.color}`}>
              {card.value}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

export default BeastCollectionTile;

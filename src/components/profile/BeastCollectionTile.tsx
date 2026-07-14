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
  uniqueAnimatedShinyTypes,
  uniqueAnimatedTypes,
  uniqueShinyTypes,
  uniqueStandardTypes,
}: BeastCollectionTileProps) {
  const cards = [
    {
      key: "animatedShiny",
      label: "Animated Shiny",
      count: animatedShinyCount,
      unique: uniqueAnimatedShinyTypes,
      color: "rgb(236, 72, 153)",
      bgGradient: "bg-gradient-to-br from-pink-500/15 via-purple-500/10 to-blue-500/5",
      borderColor: "border-pink-400/30",
      icon: "✨",
    },
    {
      key: "animated",
      label: "Animated",
      count: animatedCount,
      unique: uniqueAnimatedTypes,
      color: "rgb(125, 211, 252)",
      bgGradient: "bg-gradient-to-br from-sky-500/15 to-sky-500/5",
      borderColor: "border-sky-400/30",
      icon: "⚡",
    },
    {
      key: "shiny",
      label: "Shiny",
      count: shinyCount,
      unique: uniqueShinyTypes,
      color: "rgb(253, 224, 71)",
      bgGradient: "bg-gradient-to-br from-yellow-500/15 to-yellow-500/5",
      borderColor: "border-yellow-400/30",
      icon: "⭐",
    },
    {
      key: "standard",
      label: "Standard",
      count: standardCount,
      unique: uniqueStandardTypes,
      color: "rgb(34, 197, 94)",
      bgGradient: "bg-gradient-to-br from-green-500/15 to-green-500/5",
      borderColor: "border-green-400/30",
      icon: "🐾",
    },
  ];

  return (
    <div className="h-full">
      <div className="grid gap-2 sm:gap-3 grid-cols-2 h-full auto-rows-fr">
        {cards.map((card) => (
          <div
            key={card.key}
            className={`relative overflow-hidden rounded-xl border ${card.borderColor} ${card.bgGradient} backdrop-blur-sm p-2 sm:p-4 transition-all duration-300 hover:scale-105 hover:shadow-md min-h-[80px] sm:min-h-[100px] flex flex-col`}
          >
            <div className="flex flex-col items-center text-center gap-0.5 sm:gap-1 mb-1 sm:mb-2">
              <span className="text-xs sm:text-sm">{card.icon}</span>
              <p className="text-[10px] sm:text-xs uppercase tracking-wider text-zinc-400 font-medium">
                {card.label}
              </p>
            </div>
            <div className="flex-1 flex flex-col justify-center text-center space-y-0.5">
              <p className="text-sm sm:text-lg font-bold leading-none" style={{ color: card.color }}>
                {card.count}
              </p>
              <p className={`text-[10px] sm:text-xs leading-none ${
                card.unique === TOTAL_BEAST_VARIETIES
                  ? "text-[#39ff14] animate-pulse font-semibold"
                  : "text-zinc-500"
              }`}>
                {card.unique}/{TOTAL_BEAST_VARIETIES} unique
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default BeastCollectionTile;


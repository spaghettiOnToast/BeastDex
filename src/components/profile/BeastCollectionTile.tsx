import { TOTAL_BEAST_VARIETIES } from "../../utils/beastCollection";
import { Card, CardContent } from "../ui/card";

// CSS injection for shimmer animation
const shimmerStyles = `
  @keyframes shimmer {
    0% { transform: translateX(-200%) skewX(12deg); }
    100% { transform: translateX(200%) skewX(12deg); }
  }
`;

// Inject styles
if (typeof document !== "undefined") {
  const styleElement =
    document.getElementById("shimmer-styles") ||
    document.createElement("style");
  if (!document.getElementById("shimmer-styles")) {
    styleElement.id = "shimmer-styles";
    styleElement.textContent = shimmerStyles;
    document.head.appendChild(styleElement);
  }
}

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
      label: uniqueBeastTypes === TOTAL_BEAST_VARIETIES ? "COMPLETE! 🎉" : "Total",
      count: uniqueBeastTypes,
      total: TOTAL_BEAST_VARIETIES,
      mainValue: `${uniqueBeastTypes}`,
      subValue: `${TOTAL_BEAST_VARIETIES} Unique Beasts`,
      color: uniqueBeastTypes === TOTAL_BEAST_VARIETIES ? "rgb(57, 255, 20)" : "hsl(var(--primary))",
      bgGradient: uniqueBeastTypes === TOTAL_BEAST_VARIETIES
        ? "bg-gradient-to-br from-[#39ff14]/25 via-[#8bff72]/15 to-[#39ff14]/10 animate-pulse shadow-[0_0_30px_rgba(57,255,20,0.3)]"
        : "bg-gradient-to-br from-primary/15 to-primary/5",
      borderColor: uniqueBeastTypes === TOTAL_BEAST_VARIETIES
        ? "border-[#39ff14]/50 shadow-[0_0_20px_rgba(57,255,20,0.2)]"
        : "border-primary/30",
      icon: uniqueBeastTypes === TOTAL_BEAST_VARIETIES ? "🎉" : "🏆",
      animations: uniqueBeastTypes === TOTAL_BEAST_VARIETIES
        ? "animate-[shimmer_2s_ease-in-out_infinite] scale-105"
        : "",
    },
    {
      key: "animatedShiny",
      label: "Animated Shiny",
      count: animatedShinyCount,
      unique: uniqueAnimatedShinyTypes,
      mainValue: `${animatedShinyCount}`,
      subValue: `${uniqueAnimatedShinyTypes} Unique Beasts`,
      color: "rgb(236, 72, 153)",
      bgGradient:
        "bg-gradient-to-br from-pink-500/15 via-purple-500/10 to-blue-500/5 animate-pulse",
      borderColor: "border-pink-400/30",
      icon: "✨",
      glisten:
        "before:absolute before:inset-0 before:bg-gradient-to-r before:from-transparent before:via-white/10 before:to-transparent before:translate-x-[-200%] before:animate-[shimmer_3s_ease-in-out_infinite] before:skew-x-12",
    },
    {
      key: "animated",
      label: "Animated",
      count: animatedCount,
      unique: uniqueAnimatedTypes,
      mainValue: `${animatedCount}`,
      subValue: `${uniqueAnimatedTypes} Unique Beasts`,
      color: "rgb(125, 211, 252)",
      bgGradient: "bg-gradient-to-br from-sky-500/15 to-sky-500/5",
      borderColor: "border-sky-400/30",
      icon: "⚡",
      glisten:
        "before:absolute before:inset-0 before:bg-gradient-to-r before:from-transparent before:via-cyan-400/20 before:to-transparent before:translate-x-[-200%] before:animate-[shimmer_2.5s_ease-in-out_infinite_1s] before:skew-x-12",
    },
    {
      key: "shiny",
      label: "Shiny",
      count: shinyCount,
      unique: uniqueShinyTypes,
      mainValue: `${shinyCount}`,
      subValue: `${uniqueShinyTypes} Unique Beasts`,
      color: "rgb(253, 224, 71)",
      bgGradient: "bg-gradient-to-br from-yellow-500/15 to-yellow-500/5",
      borderColor: "border-yellow-400/30",
      icon: "⭐",
      glisten:
        "before:absolute before:inset-0 before:bg-gradient-to-r before:from-transparent before:via-yellow-300/30 before:to-transparent before:translate-x-[-200%] before:animate-[shimmer_2s_ease-in-out_infinite_0.5s] before:skew-x-12",
    },
    {
      key: "standard",
      label: "Standard",
      count: standardCount,
      unique: uniqueStandardTypes,
      mainValue: `${standardCount}`,
      subValue: `${uniqueStandardTypes} Unique Beasts`,
      color: "rgb(34, 197, 94)",
      bgGradient: "bg-gradient-to-br from-green-500/15 to-green-500/5",
      borderColor: "border-green-400/30",
      icon: "🐾",
      glisten: "",
    },
  ];

  const otherCards = cards.slice(1);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <div className="flex-1 opacity-50 h-px bg-border" />
      </div>

      <div className="grid gap-2 sm:gap-3 grid-cols-2">
        {otherCards.map((card) => (
          <Card
            key={card.key}
            className={`${card.bgGradient} ${card.borderColor} ${card.glisten} backdrop-blur-sm transition-all duration-300 hover:scale-105 hover:shadow-md min-h-[80px] sm:min-h-[120px] flex flex-col relative overflow-hidden`}
          >
            <CardContent className="p-2 sm:p-4 flex-1 flex flex-col relative z-10">
              <div className="flex flex-col items-center text-center gap-0.5 sm:gap-1.5 mb-1 sm:mb-2 min-h-[14px] sm:min-h-[20px]">
                <span className="text-xs sm:text-sm flex-shrink-0">{card.icon}</span>
                <p className="text-[10px] sm:text-xs uppercase tracking-wider text-muted-foreground font-medium truncate">
                  {card.label}
                </p>
              </div>
              <div className="flex-1 flex flex-col justify-center text-center space-y-0.5 sm:space-y-1">
                <p
                  className="text-sm sm:text-lg font-bold leading-none"
                  style={{ color: card.color }}
                >
                  {card.mainValue}
                </p>
                <p className="text-[10px] sm:text-xs text-muted-foreground leading-none">
                  {card.subValue}
                </p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

export default BeastCollectionTile;

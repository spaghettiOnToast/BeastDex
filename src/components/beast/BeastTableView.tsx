import type { Beast } from "../../services/beast";

type BeastCounts = {
  standard: number;
  shiny: number;
  animated: number;
  shinyAnimated: number;
};

type BeastTableViewProps = {
  beasts: Beast[];
  onBeastSelect?: (beast: Beast) => void;
  ownerUsernames?: Record<string, string | undefined>;
};

// Beast name mapping from beast.cairo - complete catalog of all 75 beasts
const BEAST_NAMES: { [key: number]: string } = {
  // Magical Beasts
  // T1
  1: "Warlock",
  2: "Typhon",
  3: "Jiangshi",
  4: "Anansi",
  5: "Basilisk",
  // T2
  6: "Gorgon",
  7: "Kitsune",
  8: "Lich",
  9: "Chimera",
  10: "Wendigo",
  // T3
  11: "Rakshasa",
  12: "Werewolf",
  13: "Banshee",
  14: "Draugr",
  15: "Vampire",
  // T4
  16: "Goblin",
  17: "Ghoul",
  18: "Wraith",
  19: "Sprite",
  20: "Kappa",
  // T5
  21: "Fairy",
  22: "Leprechaun",
  23: "Kelpie",
  24: "Pixie",
  25: "Gnome",

  // Hunter Beasts
  // T1
  26: "Griffin",
  27: "Manticore",
  28: "Phoenix",
  29: "Dragon",
  30: "Minotaur",
  // T2
  31: "Qilin",
  32: "Ammit",
  33: "Nue",
  34: "Skinwalker",
  35: "Chupacabra",
  // T3
  36: "Weretiger",
  37: "Wyvern",
  38: "Roc",
  39: "Harpy",
  40: "Pegasus",
  // T4
  41: "Hippogriff",
  42: "Fenrir",
  43: "Jaguar",
  44: "Satori",
  45: "Direwolf",
  // T5
  46: "Bear",
  47: "Wolf",
  48: "Mantis",
  49: "Spider",
  50: "Rat",

  // Brute Beasts
  // T1
  51: "Kraken",
  52: "Colossus",
  53: "Balrog",
  54: "Leviathan",
  55: "Tarrasque",
  // T2
  56: "Titan",
  57: "Nephilim",
  58: "Behemoth",
  59: "Hydra",
  60: "Juggernaut",
  // T3
  61: "Oni",
  62: "Jotunn",
  63: "Ettin",
  64: "Cyclops",
  65: "Giant",
  // T4
  66: "Nemean Lion",
  67: "Berserker",
  68: "Yeti",
  69: "Golem",
  70: "Ent",
  // T5
  71: "Troll",
  72: "Bigfoot",
  73: "Ogre",
  74: "Orc",
  75: "Skeleton",
};

// Helper function to get beast type and tier from the mapping
function getBeastInfo(beastName: string): { type: string; tier: number } {
  // Find the beast ID by name
  const beastId = Object.entries(BEAST_NAMES).find(
    ([_id, name]) => name === beastName
  )?.[0];

  if (!beastId) {
    return { type: "Magic", tier: 1 }; // Default fallback
  }

  const id = parseInt(beastId);

  // Determine type and tier based on ID ranges
  if (id >= 1 && id <= 25) {
    // Magic beasts (1-25)
    if (id >= 1 && id <= 5) return { type: "Magic", tier: 1 };
    if (id >= 6 && id <= 10) return { type: "Magic", tier: 2 };
    if (id >= 11 && id <= 15) return { type: "Magic", tier: 3 };
    if (id >= 16 && id <= 20) return { type: "Magic", tier: 4 };
    if (id >= 21 && id <= 25) return { type: "Magic", tier: 5 };
  } else if (id >= 26 && id <= 50) {
    // Hunter beasts (26-50)
    if (id >= 26 && id <= 30) return { type: "Hunter", tier: 1 };
    if (id >= 31 && id <= 35) return { type: "Hunter", tier: 2 };
    if (id >= 36 && id <= 40) return { type: "Hunter", tier: 3 };
    if (id >= 41 && id <= 45) return { type: "Hunter", tier: 4 };
    if (id >= 46 && id <= 50) return { type: "Hunter", tier: 5 };
  } else if (id >= 51 && id <= 75) {
    // Brute beasts (51-75)
    if (id >= 51 && id <= 55) return { type: "Brute", tier: 1 };
    if (id >= 56 && id <= 60) return { type: "Brute", tier: 2 };
    if (id >= 61 && id <= 65) return { type: "Brute", tier: 3 };
    if (id >= 66 && id <= 70) return { type: "Brute", tier: 4 };
    if (id >= 71 && id <= 75) return { type: "Brute", tier: 5 };
  }

  return { type: "Magic", tier: 1 }; // Default fallback
}

const TYPE_HEADER_COLORS = {
  Magic:
    "border-l-purple-500 bg-gradient-to-r from-purple-500/20 to-purple-600/30 backdrop-blur-sm",
  Hunter:
    "border-l-green-500 bg-gradient-to-r from-green-500/20 to-green-600/30 backdrop-blur-sm",
  Brute:
    "border-l-red-500 bg-gradient-to-r from-red-500/20 to-red-600/30 backdrop-blur-sm",
};

const TYPE_TOTAL_COLORS = {
  Magic:
    "border-l-purple-500 bg-gradient-to-r from-purple-600/25 to-purple-700/35 backdrop-blur-sm",
  Hunter:
    "border-l-green-500 bg-gradient-to-r from-green-600/25 to-green-700/35 backdrop-blur-sm",
  Brute:
    "border-l-red-500 bg-gradient-to-r from-red-600/25 to-red-700/35 backdrop-blur-sm",
};

export function BeastTableView({ beasts }: BeastTableViewProps) {
  // Build complete beast catalog from static mapping - instant loading!
  const allPossibleBeasts: Record<string, { type: string; tier: number }> = {};

  // Initialize all 75 beasts from the static mapping
  Object.values(BEAST_NAMES).forEach((beastName) => {
    const { type, tier } = getBeastInfo(beastName);
    allPossibleBeasts[beastName] = { type, tier };
  });

  console.log(
    "Loaded beast catalog from static mapping:",
    Object.keys(allPossibleBeasts).length,
    "unique beasts"
  );

  // Initialize allBeastInfo with all possible beasts from catalog
  const allBeastInfo: Record<
    string,
    { type: string; tier: number; counts: BeastCounts }
  > = {};

  // First, initialize all possible beasts with zero counts
  Object.entries(allPossibleBeasts).forEach(([beastName, { type, tier }]) => {
    allBeastInfo[beastName] = {
      type,
      tier,
      counts: { standard: 0, shiny: 0, animated: 0, shinyAnimated: 0 },
    };
  });

  // Then, count the user's actual beasts
  beasts.forEach((beast) => {
    // Extract beast name, type, and tier from attributes
    const beastNameAttr = beast.attributes.find(
      (attr) => attr.trait_type?.toLowerCase() === "beast"
    );
    const beastTypeAttr = beast.attributes.find(
      (attr) => attr.trait_type?.toLowerCase() === "type"
    );
    const beastTierAttr = beast.attributes.find(
      (attr) => attr.trait_type?.toLowerCase() === "tier"
    );

    const beastName = beastNameAttr?.value as string;
    const beastType = beastTypeAttr?.value as string;
    const beastTier = parseInt(beastTierAttr?.value as string) || 1;

    if (!beastName || !beastType) {
      return;
    }

    // If this beast is not in our catalog, add it (for edge cases)
    if (!allBeastInfo[beastName]) {
      allBeastInfo[beastName] = {
        type: beastType,
        tier: beastTier,
        counts: { standard: 0, shiny: 0, animated: 0, shinyAnimated: 0 },
      };
    }

    // Check for shiny and animated using attributes
    const isShiny = beast.attributes.some(
      (attr) => attr.trait_type?.toLowerCase() === "shiny" && attr.value === "1"
    );
    const isAnimated = beast.attributes.some(
      (attr) =>
        attr.trait_type?.toLowerCase() === "animated" && attr.value === "1"
    );

    // Count the variants
    if (isShiny && isAnimated) {
      allBeastInfo[beastName].counts.shinyAnimated++;
    } else if (isShiny) {
      allBeastInfo[beastName].counts.shiny++;
    } else if (isAnimated) {
      allBeastInfo[beastName].counts.animated++;
    } else {
      allBeastInfo[beastName].counts.standard++;
    }
  });

  // Group beasts by type from actual data
  const groupedBeasts = {
    Magic: [] as string[],
    Hunter: [] as string[],
    Brute: [] as string[],
  };

  Object.keys(allBeastInfo).forEach((beastName) => {
    const beastInfo = allBeastInfo[beastName];
    const type = beastInfo.type;

    if (groupedBeasts[type as keyof typeof groupedBeasts]) {
      groupedBeasts[type as keyof typeof groupedBeasts].push(beastName);
    }
  });

  // Sort each group by tier, then alphabetically
  Object.keys(groupedBeasts).forEach((type) => {
    groupedBeasts[type as keyof typeof groupedBeasts].sort((a, b) => {
      const tierA = allBeastInfo[a].tier;
      const tierB = allBeastInfo[b].tier;
      if (tierA !== tierB) return tierA - tierB;
      return a.localeCompare(b);
    });
  });

  // Calculate totals by type
  const typeTotals = {
    Magic: { standard: 0, shiny: 0, animated: 0, shinyAnimated: 0 },
    Hunter: { standard: 0, shiny: 0, animated: 0, shinyAnimated: 0 },
    Brute: { standard: 0, shiny: 0, animated: 0, shinyAnimated: 0 },
  };

  Object.keys(allBeastInfo).forEach((beastName) => {
    const beastInfo = allBeastInfo[beastName];
    const type = beastInfo.type;

    if (typeTotals[type as keyof typeof typeTotals]) {
      typeTotals[type as keyof typeof typeTotals].standard +=
        beastInfo.counts.standard;
      typeTotals[type as keyof typeof typeTotals].shiny +=
        beastInfo.counts.shiny;
      typeTotals[type as keyof typeof typeTotals].animated +=
        beastInfo.counts.animated;
      typeTotals[type as keyof typeof typeTotals].shinyAnimated +=
        beastInfo.counts.shinyAnimated;
    }
  });

  // Calculate overall totals
  const overallTotals = {
    standard:
      typeTotals.Magic.standard +
      typeTotals.Hunter.standard +
      typeTotals.Brute.standard,
    shiny:
      typeTotals.Magic.shiny + typeTotals.Hunter.shiny + typeTotals.Brute.shiny,
    animated:
      typeTotals.Magic.animated +
      typeTotals.Hunter.animated +
      typeTotals.Brute.animated,
    shinyAnimated:
      typeTotals.Magic.shinyAnimated +
      typeTotals.Hunter.shinyAnimated +
      typeTotals.Brute.shinyAnimated,
  };

  // Calculate duplicates (total beasts minus unique beasts owned)
  const uniqueBeastsOwned = Object.values(allBeastInfo).filter(
    (beast) =>
      beast.counts.standard > 0 ||
      beast.counts.shiny > 0 ||
      beast.counts.animated > 0 ||
      beast.counts.shinyAnimated > 0
  ).length;
  const totalBeastsOwned =
    overallTotals.standard +
    overallTotals.shiny +
    overallTotals.animated +
    overallTotals.shinyAnimated;
  const duplicates = Math.max(0, totalBeastsOwned - uniqueBeastsOwned);

  return (
    <div className="space-y-4">
      <div className="text-center">
        <h2 className="bg-gradient-to-r from-[#f9e08a] via-[#fbdc5e] to-[#39ff14] bg-clip-text text-xl font-bold mb-1 text-transparent">
          Collection Overview
        </h2>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {(["Magic", "Hunter", "Brute"] as const).map((beastType) => (
          <div
            key={beastType}
            className="bg-card/20 backdrop-blur-sm rounded-lg border border-muted/40 overflow-hidden"
          >
            <div className={`${TYPE_HEADER_COLORS[beastType]} border-l-4 p-3`}>
              <h3 className="font-bold text-sm uppercase tracking-wider text-white/90">
                ✨ {beastType} Beasts -{" "}
                {typeTotals[beastType].standard +
                  typeTotals[beastType].shiny +
                  typeTotals[beastType].animated +
                  typeTotals[beastType].shinyAnimated}{" "}
                owned
              </h3>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-xs">
                <thead>
                  <tr className="bg-gradient-to-r from-muted/40 to-muted/60 backdrop-blur-sm border-b border-border/50">
                    <th
                      className={`px-2 py-0.5 text-left font-semibold text-xs tracking-wide uppercase text-white/90 ${TYPE_TOTAL_COLORS[beastType]}`}
                    >
                      Beast
                    </th>
                    <th className="px-1 py-0.5 text-center font-semibold bg-gradient-to-b from-white/90 to-gray-100/90 text-black text-[10px] tracking-wide uppercase backdrop-blur-sm">
                      Std
                    </th>
                    <th className="px-1 py-0.5 text-center font-semibold bg-gradient-to-b from-yellow-300/90 to-yellow-400/90 text-black text-[10px] tracking-wide uppercase backdrop-blur-sm">
                      Shy
                    </th>
                    <th className="px-1 py-0.5 text-center font-semibold bg-gradient-to-b from-sky-400/90 to-sky-500/90 text-black text-[10px] tracking-wide uppercase backdrop-blur-sm">
                      Ani
                    </th>
                    <th className="px-1 py-0.5 text-center font-semibold bg-gradient-to-br from-pink-400/90 via-purple-400/90 to-blue-400/90 text-white text-[9px] tracking-wide uppercase backdrop-blur-sm">
                      SA
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {groupedBeasts[beastType].map((beastName, index) => {
                    const beastInfo = allBeastInfo[beastName];
                    const counts = beastInfo.counts;
                    const tier = beastInfo.tier;

                    const prevBeast =
                      index > 0 ? groupedBeasts[beastType][index - 1] : null;
                    const prevTier = prevBeast
                      ? allBeastInfo[prevBeast]?.tier
                      : null;
                    const isNewTier = prevTier !== null && tier !== prevTier;

                    const tierBorderClass = isNewTier
                      ? "border-t-2 border-t-white"
                      : "";
                    const regularBorderClass = "border-b border-gray-300/30";
                    const rowBackgroundClass = "bg-muted/20 hover:bg-muted/30";

                    return (
                      <tr
                        key={beastName}
                        className={`transition-all duration-200 ${rowBackgroundClass} border-l-3 border-l-border/40 ${regularBorderClass} hover:scale-[1.01] hover:shadow-sm ${tierBorderClass}`}
                      >
                        <td className="px-2 py-0.5 font-medium text-xs truncate">
                          {beastName}
                        </td>
                        <td className="px-1 py-0.5 text-center text-xs">
                          {counts.standard > 0 ? (
                            <span className="font-bold text-foreground text-xs">
                              {counts.standard}
                            </span>
                          ) : (
                            <span className="text-muted-foreground/60">-</span>
                          )}
                        </td>
                        <td className="p-1 text-center text-xs">
                          {counts.shiny > 0 ? (
                            <span className="font-bold text-foreground text-xs">
                              {counts.shiny}
                            </span>
                          ) : (
                            <span className="text-muted-foreground/60">-</span>
                          )}
                        </td>
                        <td className="p-1 text-center text-xs">
                          {counts.animated > 0 ? (
                            <span className="font-bold text-foreground text-xs">
                              {counts.animated}
                            </span>
                          ) : (
                            <span className="text-muted-foreground/60">-</span>
                          )}
                        </td>
                        <td className="p-1 text-center text-xs">
                          {counts.shinyAnimated > 0 ? (
                            <span className="font-bold text-foreground text-xs">
                              {counts.shinyAnimated}
                            </span>
                          ) : (
                            <span className="text-muted-foreground/60">-</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}

                  <tr
                    className={`${TYPE_TOTAL_COLORS[beastType]} border-l-4 border-t border-border/40 font-bold`}
                  >
                    <td className="px-2 py-0.5 text-xs uppercase tracking-wide text-white/95 truncate">
                      Total
                    </td>
                    <td className="px-1 py-0.5 text-center text-xs">
                      <span className="font-bold text-white text-xs">
                        {typeTotals[beastType].standard}
                      </span>
                    </td>
                    <td className="p-1 text-center text-xs">
                      <span className="font-bold text-white text-xs">
                        {typeTotals[beastType].shiny}
                      </span>
                    </td>
                    <td className="p-1 text-center text-xs">
                      <span className="font-bold text-white text-xs">
                        {typeTotals[beastType].animated}
                      </span>
                    </td>
                    <td className="p-1 text-center text-xs">
                      <span className="font-bold text-white text-xs">
                        {typeTotals[beastType].shinyAnimated}
                      </span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </div>

      {/* Overall totals row */}
      <div className="bg-gradient-to-r from-gray-800/90 via-gray-900/90 to-black/90 text-white font-bold border border-lsGold/50 backdrop-blur-sm rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-xs">
            <tbody>
              <tr>
                <td className="p-1 text-xs uppercase tracking-widest">
                  <span className="bg-gradient-to-r from-[#f9e08a] via-[#fbdc5e] to-[#39ff14] bg-clip-text text-transparent font-bold">
                    TOTAL BEASTS -{" "}
                    {overallTotals.standard +
                      overallTotals.shiny +
                      overallTotals.animated +
                      overallTotals.shinyAnimated}{" "}
                    Total
                  </span>
                </td>
                <td className="p-1 text-center text-xs">
                  <div className="flex items-center justify-center gap-1">
                    <span className="inline-flex items-center justify-center min-w-[20px] h-5 rounded bg-gray-500/30 font-bold text-white backdrop-blur-sm border border-gray-500/30">
                      {duplicates}
                    </span>
                    <span className="text-[9px] text-white/70 uppercase tracking-wide">
                      Duplicates
                    </span>
                  </div>
                </td>
                <td className="p-1 text-center text-xs">
                  <div className="flex items-center justify-center gap-1">
                    <span className="inline-flex items-center justify-center min-w-[20px] h-5 rounded bg-white/20 font-bold text-white backdrop-blur-sm border border-white/20">
                      {overallTotals.standard}
                    </span>
                    <span className="text-[9px] text-white/70 uppercase tracking-wide">
                      Standard
                    </span>
                  </div>
                </td>
                <td className="p-1 text-center text-xs">
                  <div className="flex items-center justify-center gap-1">
                    <span className="inline-flex items-center justify-center min-w-[20px] h-5 rounded bg-yellow-400/30 font-bold text-white backdrop-blur-sm border border-yellow-400/30">
                      {overallTotals.shiny}
                    </span>
                    <span className="text-[9px] text-white/70 uppercase tracking-wide">
                      Shiny
                    </span>
                  </div>
                </td>
                <td className="p-1 text-center text-xs">
                  <div className="flex items-center justify-center gap-1">
                    <span className="inline-flex items-center justify-center min-w-[20px] h-5 rounded bg-sky-400/30 font-bold text-white backdrop-blur-sm border border-sky-400/30">
                      {overallTotals.animated}
                    </span>
                    <span className="text-[9px] text-white/70 uppercase tracking-wide">
                      Animated
                    </span>
                  </div>
                </td>
                <td className="p-1 text-center text-xs">
                  <div className="flex items-center justify-center gap-1">
                    <span className="inline-flex items-center justify-center min-w-[20px] h-5 rounded bg-gradient-to-r from-pink-400/30 via-purple-400/30 to-blue-400/30 font-bold text-white backdrop-blur-sm border border-purple-400/30">
                      {overallTotals.shinyAnimated}
                    </span>
                    <span className="text-[8px] text-white/70 uppercase tracking-wide">
                      Shiny Anim
                    </span>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {beasts.length === 0 && (
        <div className="text-center py-8 bg-card/10 backdrop-blur-sm rounded-lg border border-muted/30">
          <p className="text-muted-foreground text-sm">
            No beasts found in this collection.
          </p>
          <p className="text-muted-foreground/70 text-xs mt-1">
            Start your beast hunting journey!
          </p>
        </div>
      )}
    </div>
  );
}

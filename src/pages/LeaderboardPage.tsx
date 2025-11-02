import { useState } from "react";
import TopBar from "../components/header/TopBar";
import { AppLayout } from "../components/layout/AppLayout";
import { RankLeaderboard } from "../components/leaderboard/RankLeaderboard";
import { MostCollectedBeast } from "../components/leaderboard/MostCollectedBeast";
import { BeastOfTheDay } from "../components/leaderboard/BeastOfTheDay";
import { BeastCollectionStats } from "../components/leaderboard/BeastCollectionStats";
import { BeastSlayerLeaderboard } from "../components/leaderboard/BeastSlayerLeaderboard";

type LeaderboardTab =
  | "power"
  | "beastNames"
  | "stats"
  | "beastOfTheDay"
  | "slayer";

function LeaderboardPage() {
  const [activeTab, setActiveTab] = useState<LeaderboardTab>("power");

  const topBar = <TopBar />;

  const tabs = [
    {
      id: "power" as const,
      label: "Power Rank",
      description: "Top players by total power",
    },
    {
      id: "beastNames" as const,
      label: "Most Collected Beast",
      description: "Top collectors by total beasts owned",
    },
    {
      id: "stats" as const,
      label: "Collection Stats",
      description: "Detailed breakdowns by shiny, animated, and standard hunts",
    },
    {
      id: "beastOfTheDay" as const,
      label: "Beast of the Day",
      description: "Most prestigious beasts fallen in the past 24 hours",
    },
    {
      id: "slayer" as const,
      label: "Slayer",
      description: "Beasts with the highest adventurer body counts",
    },
  ];

  return (
    <AppLayout topBar={topBar}>
      <div className="flex flex-col gap-6">
        {/* Title */}
        <div className="flex flex-col items-center text-center">
          <h1 className="bg-gradient-to-r from-[#ff7cf7] via-[#7dfbff] to-[#8bff72] bg-clip-text text-3xl font-semibold uppercase tracking-[0.35em] text-transparent">
            Leaderboards
          </h1>
          <p className="text-[11px] uppercase tracking-[0.2em] text-gray-500 mt-2">
            Global rankings and statistics
          </p>
        </div>

        {/* Tab Navigation */}
        <div className="flex justify-center">
          <div className="flex bg-gray-900/80 backdrop-blur-sm border border-gray-700 rounded-xl p-1.5 shadow-lg">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`
                  px-6 py-3 rounded-lg text-sm font-bold uppercase tracking-wider transition-all duration-300 min-w-[140px]
                  ${
                    activeTab === tab.id
                      ? "bg-gradient-to-r from-[#8bff72] to-[#39ff14] text-gray-900 shadow-[0_0_20px_rgba(139,255,114,0.4)] scale-105"
                      : "text-gray-300 hover:text-lsGold hover:bg-gray-800/50 hover:scale-102"
                  }
                `}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Tab Description */}
        <div className="text-center">
          <p className="text-sm text-gray-400">
            {tabs.find((tab) => tab.id === activeTab)?.description}
          </p>
        </div>

        {/* Tab Content */}
        <div className="min-h-[400px] relative">
          <div className="absolute inset-0 bg-gradient-to-br from-[#8bff72]/5 via-transparent to-lsGold/5 rounded-2xl pointer-events-none"></div>
          <div className="relative z-10">
            {activeTab === "power" && <RankLeaderboard />}
            {activeTab === "beastNames" && <MostCollectedBeast />}
            {activeTab === "stats" && <BeastCollectionStats />}
            {activeTab === "beastOfTheDay" && <BeastOfTheDay />}
            {activeTab === "slayer" && <BeastSlayerLeaderboard />}
          </div>
        </div>
      </div>
    </AppLayout>
  );
}

export default LeaderboardPage;

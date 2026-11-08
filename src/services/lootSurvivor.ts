/**
 * lootsurvivor.io links and its dungeon lineup (mirrors the dungeon cards on
 * lootsurvivor.io; play happens there). Card art is loaded from lootsurvivor.io
 * rather than copied into this repo.
 */

export const LOOT_SURVIVOR_URL = "https://www.lootsurvivor.io";

/** A dungeon's page on lootsurvivor.io. */
export const lootSurvivorDungeonUrl = (dungeonId: string) => `${LOOT_SURVIVOR_URL}/${encodeURIComponent(dungeonId)}`;

export type DungeonStatus = "online" | "closed";

export type Dungeon = {
  id: string;
  name: string;
  tagline: string;
  /** path on lootsurvivor.io */
  image: string;
  accentColor: string;
  status: DungeonStatus;
  entryCost: string;
  difficulty: "Easy" | "Medium" | "Hard";
  reward: string;
  tags: string[];
  /** festival collection minted here (see services/festivalBeasts) */
  festivalSlug?: string;
};

export const DUNGEONS: Dungeon[] = [
  {
    id: "beastmode",
    name: "Beast Mode",
    tagline: "Hunt and collect beasts",
    image: "/images/dungeons/beast_mode.png",
    accentColor: "#4caf50",
    status: "online",
    entryCost: "1 Ticket",
    difficulty: "Medium",
    reward: "Beasts",
    tags: ["Collectables", "Endless"],
  },
  {
    id: "trials",
    name: "Trials",
    tagline: "Face the trials",
    image: "/images/dungeons/trials.png",
    accentColor: "#e65100",
    status: "online",
    entryCost: "Free",
    difficulty: "Easy",
    reward: "Beasts",
    tags: ["Practice"],
  },
  {
    id: "karats",
    name: "Karats",
    tagline: "Verify with zkPassport · 3 free games a day",
    image: "/images/dungeons/karat.png",
    accentColor: "#26c6da",
    status: "online",
    entryCost: "Free",
    difficulty: "Easy",
    reward: "KARAT",
    tags: ["Free", "Collectables"],
  },
  {
    id: "pvp",
    name: "PvP Dungeons",
    tagline: "3 players. 1 table. Best run wins.",
    image: "/images/dungeons/tournaments.png",
    accentColor: "#46d160",
    status: "online",
    entryCost: "Free",
    difficulty: "Hard",
    reward: "Up to $21 USDC",
    tags: ["PvP"],
  },
  {
    id: "tournaments",
    name: "Tournaments",
    tagline: "Compete for rewards",
    image: "/images/dungeons/tournaments.png",
    accentColor: "#e65100",
    status: "online",
    entryCost: "Varies",
    difficulty: "Hard",
    reward: "Prizes",
    tags: ["PvP"],
  },
  {
    id: "norwich-games-festival",
    name: "Norwich Games Festival",
    tagline: "Free entries from your QR leaflet",
    image: "/images/dungeons/norwich.png",
    accentColor: "#80ff00",
    status: "closed",
    entryCost: "Free",
    difficulty: "Easy",
    reward: "Tiddy Mun Beast",
    tags: ["Free", "Collectables"],
    festivalSlug: "tiddy-mun",
  },
  {
    id: "black-shuck-festival",
    name: "Black Shuck Festival",
    tagline: "Slay the hunt, claim the hound",
    image: "/images/dungeons/black-shuck.png",
    accentColor: "#ff2d2d",
    status: "closed",
    entryCost: "Free",
    difficulty: "Easy",
    reward: "Black Shuck Beast",
    tags: ["Free", "Collectables"],
    festivalSlug: "black-shuck",
  },
  {
    id: "lootbag",
    name: "Loot Bag",
    tagline: "Fight for your share",
    image: "/images/dungeons/lootbag.png",
    accentColor: "#d4a017",
    status: "closed",
    entryCost: "Loot Bag",
    difficulty: "Easy",
    reward: "$SURVIVOR",
    tags: ["Endless"],
  },
];

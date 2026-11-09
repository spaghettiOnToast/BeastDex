import { describe, expect, it } from "vitest";
import {
  buildGameTransferCall,
  decodeGameTokenId,
  gameDungeonFor,
  gameFromRow,
  gameStatus,
  gameTradeBlocker,
  GAME_CORE_ADDRESS,
  levelFromXp,
  lootSurvivorPlayUrl,
  listBlocker,
  buyBlocker,
  acceptOfferBlocker,
  playedSince,
  secondsUntilIdle,
  IDLE_SECONDS,
  gameFromDetail,
  itemName,
  itemSlot,
  itemType,
  itemTier,
  itemGreatness,
  itemImageUrl,
  itemSpecials,
  specialItemName,
} from "../src/services/adventurers";

// A real Beast Mode game (lootsurvivor.io/play?id=…&dungeon=beastmode)
const BEAST_MODE_ID = "374144419157391711793985745714028935650737019889185";

describe("decodeGameTokenId", () => {
  it("decodes the packet layout", () => {
    const d = decodeGameTokenId(BEAST_MODE_ID)!;
    expect(d.schemaVersion).toBe(1);
    expect(d.minterId).toBe(1);
    expect(d.settingsId).toBe(2);
    expect(d.mintedAtBlock).toBe(17663521);
    expect(d.mintedAt).toBe(1794175920);
    expect(d.soulbound).toBe(false);
    expect(d.playDuration).toBe(0);
  });

  it("accepts hex and bigint", () => {
    const hex = "0x000000000000000000000100000000020000000001c84854010d862100172621";
    expect(decodeGameTokenId(hex)?.minterId).toBe(1);
    expect(decodeGameTokenId(BigInt(BEAST_MODE_ID))?.settingsId).toBe(2);
  });

  it("reads the soulbound bit and rejects junk", () => {
    expect(decodeGameTokenId(BigInt(BEAST_MODE_ID) | (1n << 249n))?.soulbound).toBe(true);
    expect(decodeGameTokenId("0")).toBeNull();
    expect(decodeGameTokenId("not a number")).toBeNull();
    expect(decodeGameTokenId("2")).toBeNull(); // schema 2 is unknown
  });
});

describe("game status", () => {
  const row = {
    tokenId: "0x000000000000000000000100000000020000000001c84854010d862100172621",
    score: 22,
    health: 128,
    gold: 8,
    actionCount: 7,
    started: true,
    gameOver: false,
    stuck: false,
    lastActionAt: "2026-11-08T22:23:06.000Z",
  };

  it("maps an API row", () => {
    const g = gameFromRow(row, "0xabc")!;
    expect(g.tokenId).toBe(BEAST_MODE_ID);
    expect(g.minterId).toBe(1);
    expect(g.xp).toBe(22);
    expect(g.level).toBe(4);
    expect(g.lastActionAt).toBe(Date.parse(row.lastActionAt) / 1000);
    expect(gameStatus(g)).toBe("in-progress");
    expect(gameTradeBlocker(g)).toBeNull();
  });

  it("classifies unplayed / dead / stuck", () => {
    expect(gameStatus(gameFromRow({ ...row, started: false, actionCount: 0 })!)).toBe("unplayed");
    const dead = gameFromRow({ ...row, gameOver: true, health: 0 })!;
    expect(gameStatus(dead)).toBe("dead");
    expect(gameTradeBlocker(dead)).toMatch(/dead/);
    expect(gameStatus(gameFromRow({ ...row, stuck: true })!)).toBe("stuck");
  });

  it("levels like Loot Survivor", () => {
    expect(levelFromXp(0)).toBe(1);
    expect(levelFromXp(3)).toBe(1);
    expect(levelFromXp(4)).toBe(2);
    expect(levelFromXp(100)).toBe(10);
  });
});

describe("dungeons and links", () => {
  it("maps minter ids to ticket types", () => {
    expect(gameDungeonFor(1).name).toBe("Beast Mode");
    expect(gameDungeonFor(3).dungeonId).toBe("karats");
    expect(gameDungeonFor(4).name).toBe("Tournament / PvP");
    expect(gameDungeonFor(999).name).toBe("Dungeon #999");
  });

  it("builds the play link with the decimal id", () => {
    expect(lootSurvivorPlayUrl(BEAST_MODE_ID, 1)).toBe(
      `https://www.lootsurvivor.io/play?id=${BEAST_MODE_ID}&dungeon=beastmode`,
    );
  });

  it("builds a u256 transfer", () => {
    const call = buildGameTransferCall("0x1", "0x2", BEAST_MODE_ID);
    expect(call.contractAddress).toBe(GAME_CORE_ADDRESS);
    expect(call.entrypoint).toBe("transfer_from");
    const [from, to, low, high] = call.calldata as string[];
    expect([from, to]).toEqual(["0x1", "0x2"]);
    expect((BigInt(high) << 128n) + BigInt(low)).toBe(BigInt(BEAST_MODE_ID));
  });
});

describe("trading rules", () => {
  const base = {
    tokenId: "0x000000000000000000000100000000020000000001c84854010d862100172621",
    score: 22,
    health: 128,
    gold: 8,
    actionCount: 7,
    started: true,
    gameOver: false,
    stuck: false,
    lastActionAt: "2026-11-08T22:00:00.000Z",
  };
  const lastAction = Date.parse(base.lastActionAt) / 1000;
  const live = gameFromRow(base)!;
  const unplayed = gameFromRow({ ...base, started: false, actionCount: 0, lastActionAt: null })!;

  it("lists unplayed games any time, started games after 5 idle minutes", () => {
    expect(listBlocker(unplayed, lastAction)).toBeNull();
    expect(listBlocker(live, lastAction + 60)).toMatch(/Wait 4 min/);
    expect(listBlocker(live, lastAction + IDLE_SECONDS)).toBeNull();
    expect(secondsUntilIdle(live, lastAction + 100)).toBe(IDLE_SECONDS - 100);
  });

  it("refuses when the last action time is unknown", () => {
    expect(listBlocker({ ...live, lastActionAt: null }, lastAction + 9999)).toMatch(/Couldn't read/);
  });

  it("voids a listing once the game moves after it", () => {
    const listedAt = lastAction + 600;
    const later = listedAt + 3600;
    expect(buyBlocker(live, listedAt, later)).toBeNull();
    const playedAfter = { ...live, lastActionAt: listedAt + 10 };
    expect(playedSince(playedAfter, listedAt)).toBe(true);
    expect(buyBlocker(playedAfter, listedAt, later)).toMatch(/after listing/);
    expect(buyBlocker(gameFromRow({ ...base, gameOver: true })!, listedAt, later)).toMatch(/dead/);
    expect(buyBlocker(null, listedAt, later)).toMatch(/Couldn't find/);
  });

  it("blocks accepting an offer made before the owner's last move", () => {
    expect(acceptOfferBlocker(live, lastAction + 60, lastAction + 3600)).toBeNull();
    expect(acceptOfferBlocker(live, lastAction - 60, lastAction + 3600)).toMatch(/played since this offer/);
    expect(acceptOfferBlocker(live, lastAction + 60, lastAction + 120)).toMatch(/Wait/);
  });
});

describe("gear", () => {
  it("names, slots, types and tiers items", () => {
    expect([itemName(9), itemSlot(9), itemType(9), itemTier(9)]).toEqual(["Ghost Wand", "Weapon", "Magic", 1]);
    expect([itemName(21), itemSlot(21), itemType(21), itemTier(21)]).toEqual(["Shirt", "Chest", "Cloth", 5]);
    expect([itemName(42), itemSlot(42), itemType(42), itemTier(42)]).toEqual(["Katana", "Weapon", "Blade", 1]);
    expect([itemName(101), itemSlot(101), itemType(101), itemTier(101)]).toEqual(["Heavy Gloves", "Hand", "Metal", 5]);
    expect([itemSlot(4), itemTier(4), itemTier(5), itemTier(8)]).toEqual(["Ring", 2, 3, 1]);
    expect(itemImageUrl(53)).toBe("https://www.lootsurvivor.io/images/loot/dragons_crown.png");
  });

  it("caps greatness at 20", () => {
    expect([itemGreatness(0), itemGreatness(28), itemGreatness(400), itemGreatness(10_000)]).toEqual([1, 5, 20, 20]);
  });

  it("parses the single-game payload", () => {
    const g = gameFromDetail({
      tokenId: "0x000000000000000000000100000000020000000001c84854010d862100172621",
      owner: "0xabc",
      adventurer: {
        xp: 22,
        gold: 8,
        health: 128,
        beast_health: 0,
        stats: { luck: 2, wisdom: 2, charisma: 2, strength: 2, vitality: 2, dexterity: 2, intelligence: 5 },
        equipment: { weapon: { id: 9, xp: 28 }, chest: { id: 21, xp: 28 }, neck: { id: 0, xp: 0 } },
        stat_upgrades_available: 1,
      },
      bag: [{ id: 12, xp: 0 }, { id: 0, xp: 0 }],
      actionCount: 7,
      started: true,
      gameOver: false,
    })!;
    expect(g.gear?.equipment.Weapon).toEqual({ id: 9, xp: 28 });
    expect(g.gear?.equipment.Neck).toBeUndefined();
    expect(g.gear?.bag).toEqual([{ id: 12, xp: 0 }]);
    expect(g.gear?.stats.intelligence).toBe(5);
    expect(g.gear?.statUpgrades).toBe(1);
  });
});

describe("item specials", () => {
  // Game 0x…1c8404e010c64b6001b06a1 (item_specials_salt 11096), all gear at greatness 20.
  // Expected names come from the lootsurvivor.io client's algorithm (getSpecialsSeed / getSpecials).
  const salt = 11096;
  const name = (id: number, xp: number) => specialItemName(itemName(id), itemSpecials(id, itemGreatness(xp), salt));

  it("derives prefix and suffix at greatness 19+", () => {
    expect(name(9, 400)).toBe("Corpse Whisper Ghost Wand of Fury");
    expect(name(17, 400)).toBe("Onslaught Shadow Divine Robe of Detection");
    expect(name(3, 400)).toBe("Vortex Root Amulet of the Twins");
    expect(name(4, 400)).toBe("Miracle Instrument Silver Ring of Anger");
  });

  it("only the suffix at 15–18, nothing below 15", () => {
    expect(itemSpecials(9, 15, salt)).toEqual({ suffix: "of Fury", prefix: null });
    expect(itemSpecials(9, 14, salt)).toEqual({ suffix: null, prefix: null });
    expect(name(19, 144)).toBe("Linen Robe"); // G12
  });
});

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

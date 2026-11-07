/**
 * Beasts v3 print condition, decoded from the token id. Labels and formatting
 * match lootsurvivor.io's beast detail dialog.
 */
import { beastsV3, type CardCondition } from "@provable-games/collectables";

export type ConditionRow = { label: string; value: string };

const PERFECT_CENTERING_BPS = 10000;
const VOID_LEVELS = ["None", "Low", "Medium", "High"];
const WEAR_LEVELS = ["None", "Light", "Moderate", "Heavy"];

/** Thousandths -> trimmed decimal string: 50000 -> "50", 47500 -> "47.5". */
function thousandths(n: number): string {
  const whole = Math.floor(n / 1000);
  const frac = n % 1000;
  return frac === 0 ? String(whole) : `${whole}.${String(frac).padStart(3, "0").replace(/0+$/, "")}`;
}

/** Centering quality in bps as a grading split: 10000 -> "50/50", 9000 -> "55/45". */
export function formatCentering(bps: number): string {
  const minor = bps * 5;
  return `${thousandths(100000 - minor)}/${thousandths(minor)}`;
}

function shift(bps: number, direction: number, neg: string, pos: string): string {
  return bps === PERFECT_CENTERING_BPS ? "Centered" : direction === 0 ? neg : pos;
}

function location(level: number, inArt: number): string {
  return level === 0 ? "None" : inArt === 0 ? "Outside Art" : "In Art";
}

const level = (names: string[], n: number) => names[Math.min(n, names.length - 1)];

export function conditionRows(c: CardCondition): ConditionRow[] {
  return [
    { label: "Horizontal Centering", value: formatCentering(c.centeringXBps) },
    { label: "Horizontal Shift", value: shift(c.centeringXBps, c.centeringXDirection, "Left", "Right") },
    { label: "Vertical Centering", value: formatCentering(c.centeringYBps) },
    { label: "Vertical Shift", value: shift(c.centeringYBps, c.centeringYDirection, "Up", "Down") },
    { label: "Hickeys", value: String(c.hickeyCount) },
    { label: "Hickey Location", value: location(c.hickeyCount, c.hickeysInArt) },
    { label: "Voids", value: level(VOID_LEVELS, c.voidLevel) },
    { label: "Void Location", value: location(c.voidLevel, c.voidsInArt) },
    { label: "Roller Marks", value: level(WEAR_LEVELS, c.rollerLevel) },
    { label: "Roller Location", value: location(c.rollerLevel, c.rollersInArt) },
    { label: "Edge Chips", value: level(WEAR_LEVELS, c.edgeChipLevel) },
    { label: "Corner Chips", value: level(WEAR_LEVELS, c.cornerChipLevel) },
  ];
}

/** Condition rows for a v3 token id, or null for legacy / undecodable ids. */
export function beastConditionRows(tokenId: string | null | undefined): ConditionRow[] | null {
  if (!tokenId) return null;
  try {
    return conditionRows(beastsV3.decodeTokenId(BigInt(tokenId)).condition);
  } catch {
    return null;
  }
}

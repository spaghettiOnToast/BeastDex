/**
 * When a game may change hands on the marketplace.
 *
 * Loot Survivor is commit-reveal: an action is committed in one block and its
 * outcome is fixed by a block hash ~10 blocks later. A game that has been idle
 * for IDLE_SECONDS therefore has no action waiting to be revealed, and its state
 * is final until the owner moves again.
 *
 * - List: unplayed, or idle ≥ 5 min (state is settled when listed).
 * - Buy: the game must not have moved since it was listed (the buyer gets the
 *   exact state that was put up for sale) and must still be idle ≥ 5 min.
 * - Accept an offer: the game must not have moved since the offer was made.
 *
 * What these rules can't close: a seller acting in the few seconds between the
 * final check and the purchase landing on-chain. The NFT isn't locked while
 * listed, so only an escrow contract could prevent that.
 */
import { gameTradeBlocker, type AdventurerGame } from "./api";

/** No action for this long = nothing pending reveal. */
export const IDLE_SECONDS = 5 * 60;

const mins = (s: number) => `${Math.max(1, Math.ceil(s / 60))} min`;

/** Seconds until the game counts as idle (0 = idle now; null = can't tell). */
export function secondsUntilIdle(game: AdventurerGame, nowSec = Date.now() / 1000): number | null {
  if (!game.started) return 0;
  if (game.lastActionAt === null) return null;
  return Math.max(0, Math.ceil(game.lastActionAt + IDLE_SECONDS - nowSec));
}

function idleBlocker(game: AdventurerGame, nowSec: number, who: "you" | "the seller" | "the owner"): string | null {
  const wait = secondsUntilIdle(game, nowSec);
  if (wait === null) return "Couldn't read when this game was last played. Try again shortly.";
  if (wait > 0) {
    return who === "you"
      ? `Wait ${mins(wait)}: games can be sold 5 minutes after their last move, once it's revealed.`
      : `Played under 5 minutes ago by ${who}. Try again in ${mins(wait)}.`;
  }
  return null;
}

/** Why the owner can't list this game right now (null = can list). */
export function listBlocker(game: AdventurerGame, nowSec = Date.now() / 1000): string | null {
  return gameTradeBlocker(game) ?? idleBlocker(game, nowSec, "you");
}

/** Whether the game moved after `sinceSec` (a listing or offer time). */
export function playedSince(game: AdventurerGame | null, sinceSec: number | undefined | null): boolean {
  return !!game?.lastActionAt && !!sinceSec && game.lastActionAt > sinceSec;
}

/** Why a listing can't be bought right now (null = can buy). */
export function buyBlocker(game: AdventurerGame | null, listedAt: number | undefined, nowSec = Date.now() / 1000): string | null {
  if (!game) return "Couldn't find this game on Loot Survivor.";
  const base = gameTradeBlocker(game);
  if (base) return base;
  if (playedSince(game, listedAt)) {
    return "The seller played this game after listing it, so the listing is void until they relist it.";
  }
  return idleBlocker(game, nowSec, "the seller");
}

/** Why the owner can't accept an offer right now (null = can accept). */
export function acceptOfferBlocker(game: AdventurerGame | null, offerMadeAt: number | undefined, nowSec = Date.now() / 1000): string | null {
  if (!game) return "Couldn't read this game's state.";
  const base = gameTradeBlocker(game);
  if (base) return base;
  if (playedSince(game, offerMadeAt)) {
    return "You've played since this offer was made, so it was for an earlier state of the game. Ask the buyer to make a new offer.";
  }
  return idleBlocker(game, nowSec, "you");
}

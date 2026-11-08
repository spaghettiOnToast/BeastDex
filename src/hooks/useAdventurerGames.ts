import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { Listing } from "../services/marketplace/types";
import { useMarketplaceListings } from "../pages/marketplace/hooks/useMarketplaceListings";
import {
  GAME_CORE_ADDRESS,
  fetchGame,
  fetchGamesForListings,
  fetchOwnerGames,
  type AdventurerGame,
} from "../services/adventurers";

/** A marketplace listing of a Loot Survivor game, with its live state. */
export type AdventurerListing = Listing & { game: AdventurerGame | null };

/** The connected wallet's games across every known dungeon. */
export function useMyGames(address: string | undefined) {
  return useQuery({
    queryKey: ["adventurerGames", address],
    enabled: !!address,
    staleTime: 30_000,
    refetchOnWindowFocus: true,
    queryFn: ({ signal }) => fetchOwnerGames(address!, { signal }),
  });
}

/** Active listings on the game core, hydrated with each game's current state. */
export function useAdventurerListings() {
  const listingsHook = useMarketplaceListings(GAME_CORE_ADDRESS);
  const items = useMemo(
    () => listingsHook.listings.map((l) => ({ tokenId: l.tokenId, seller: l.seller })),
    [listingsHook.listings],
  );
  const itemsKey = useMemo(() => items.map((i) => `${i.tokenId}:${i.seller}`).sort().join(","), [items]);

  const gamesQuery = useQuery({
    queryKey: ["adventurerListingGames", itemsKey],
    enabled: items.length > 0,
    staleTime: 30_000,
    refetchInterval: 60_000, // keep live state fresh while browsing
    queryFn: ({ signal }) => fetchGamesForListings(items, signal),
  });

  const listings: AdventurerListing[] = useMemo(() => {
    const games = gamesQuery.data;
    return listingsHook.listings.map((l) => ({ ...l, game: games?.get(l.tokenId) ?? null }));
  }, [listingsHook.listings, gamesQuery.data]);

  return {
    ...listingsHook,
    listings,
    gamesLoading: gamesQuery.isLoading && items.length > 0,
    refetchGames: gamesQuery.refetch,
  };
}

/** One game's full state (gear, bag, stats), fetched only when `enabled` (e.g. on hover). */
export function useGameDetail(tokenId: string, enabled: boolean) {
  return useQuery({
    queryKey: ["adventurerGameDetail", tokenId],
    enabled,
    staleTime: 60_000,
    queryFn: ({ signal }) => fetchGame(tokenId, signal),
  });
}

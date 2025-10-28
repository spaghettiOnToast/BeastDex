import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useDojoSDK } from "@dojoengine/sdk/react";
import { ToriiQueryBuilder, KeysClause, MemberClause, AndComposeClause } from "@dojoengine/sdk";
import { addAddressPadding, getChecksumAddress } from "starknet";
import { CategoryType, StatusType } from "@cartridge/marketplace";

// Arcade model name used by Torii
const ARCADE_ORDER_MODEL = "ARCADE-Order";

function buildArcadeOrderBaseClause(collectionAddress: string, tokenId?: string | number) {
  return AndComposeClause([
    KeysClause(
      [ARCADE_ORDER_MODEL],
      [undefined, addAddressPadding(collectionAddress), tokenId ? String(tokenId) : undefined, undefined],
      "FixedLen",
    ),
    MemberClause(ARCADE_ORDER_MODEL, "category", "Eq", String(2)), // Sell
    MemberClause(ARCADE_ORDER_MODEL, "status", "Eq", String(1)), // Placed
  ]);
}

function getArcadeListedTokensForCollection(collectionAddress: string) {
  // Note: Avoid ordering until confirmed column names to prevent cursor errors
  return new ToriiQueryBuilder()
    .withClause(buildArcadeOrderBaseClause(collectionAddress, undefined).build())
    .withEntityModels([ARCADE_ORDER_MODEL])
    .includeHashedKeys();
}

function getArcadeIsTokenListed(collectionAddress: string, tokenId: string) {
  return new ToriiQueryBuilder()
    .withClause(buildArcadeOrderBaseClause(collectionAddress, tokenId).build())
    .withEntityModels([ARCADE_ORDER_MODEL])
    .includeHashedKeys();
}

// Minimal order shape compatible with existing hydrateOrders flow
export type ArcadeOrderModelCompat = {
  identifier: string;
  id: number;
  category: { value: CategoryType; into: () => number };
  status: { value: StatusType; into: () => number };
  expiration: number;
  collection: string;
  tokenId: number;
  quantity: number;
  price: number;
  currency: string;
  owner: string;
};

function parseArcadeOrder(entity: any): ArcadeOrderModelCompat | null {
  const model = entity?.models?.ARCADE?.Order;
  if (!model) return null;
  const id = Number(model.id ?? 0);
  const expiration = Number(model.expiration ?? 0);
  const tokenId = Number(model.token_id ?? 0);
  const quantity = Number(model.quantity ?? 0);
  const price = Number(model.price ?? 0);
  const collection = getChecksumAddress(model.collection ?? "0x0");
  const currency = getChecksumAddress(model.currency ?? "0x0");
  const owner = getChecksumAddress(model.owner ?? "0x0");
  // Torii stores category/status as numeric indices; map to string enums used in our UI
  const catIndex = Number(model.category ?? 0);
  const statIndex = Number(model.status ?? 0);
  const categoryValue = [CategoryType.None, CategoryType.Buy, CategoryType.Sell][catIndex] ?? CategoryType.None;
  const statusValue = [StatusType.None, StatusType.Placed, StatusType.Canceled, StatusType.Executed][statIndex] ?? StatusType.None;
  return {
    identifier: entity?.entityId ?? String(id),
    id,
    category: { value: categoryValue, into: () => catIndex },
    status: { value: statusValue, into: () => statIndex },
    expiration,
    collection,
    tokenId,
    quantity,
    price,
    currency,
    owner,
  };
}

export function useArcadeListedTokensForCollection(collectionAddress: string) {
  const { sdk } = useDojoSDK();
  const q = useMemo(() => getArcadeListedTokensForCollection(collectionAddress), [collectionAddress]);
  const queryKey = useMemo(() => ["arcadeListedTokens", collectionAddress], [collectionAddress]);

  return useQuery({
    queryKey,
    enabled: !!collectionAddress,
    // Increase staleTime to avoid refetching too often
    staleTime: 30_000, // Consider data fresh for 30 seconds
    queryFn: async () => {
      const combined: ArcadeOrderModelCompat[] = [];
      let cursor: string | undefined = undefined;
      let page = 0;

      // Limit initial fetch to 5 pages (~500 listings max) for faster initial load
      const MAX_PAGES = 5;

      console.log(`[Arcade Orders] Starting fetch (max ${MAX_PAGES} pages)`);
      const startTime = performance.now();

      try {
        // Fetch up to MAX_PAGES for reasonable initial load time
        while (page < MAX_PAGES) {
          const res: any = await (sdk as any).getEntities({ query: q, cursor });

          if (!res || !res.getItems) {
            console.error('[Arcade Orders] Invalid response from SDK');
            break;
          }

          const items = res.getItems().map((e: any) => parseArcadeOrder(e)).filter(Boolean) as ArcadeOrderModelCompat[];
          combined.push(...items);

          const next = (res.next as string | undefined) || (res.next_cursor as string | undefined) || undefined;

          console.log(`[Arcade Orders] Page ${page + 1}: fetched ${items.length} items (total: ${combined.length}, hasNext: ${!!next})`);

          // Stop if no more pages or if we got 0 items (safety check)
          if (!next || items.length === 0) {
            console.log(`[Arcade Orders] Fetch complete. Total: ${combined.length} orders`);
            break;
          }

          cursor = next;
          page++;
        }

        if (page >= MAX_PAGES) {
          console.log(`[Arcade Orders] Stopped at page ${MAX_PAGES} (showing first ${combined.length} listings). Use filters to narrow down results.`);
        }
      } catch (error) {
        console.error('[Arcade Orders] Error during fetch:', error);
        // Return what we have so far instead of failing completely
      }

      const endTime = performance.now();
      console.log(`[Arcade Orders] Fetched ${combined.length} orders in ${(endTime - startTime).toFixed(0)}ms`);
      return combined;
    },
  });
}

export function useArcadeIsTokenListed(collectionAddress: string, tokenId: string) {
  const { sdk } = useDojoSDK();
  const q = useMemo(() => getArcadeIsTokenListed(collectionAddress, tokenId), [collectionAddress, tokenId]);
  const queryKey = useMemo(() => ["arcadeIsTokenListed", collectionAddress, tokenId], [collectionAddress, tokenId]);

  return useQuery({
    queryKey,
    enabled: !!collectionAddress && !!tokenId,
    queryFn: async () => {
      const res = await sdk.getEntities({ query: q });
      const items = res.getItems().map((e: any) => parseArcadeOrder(e)).filter(Boolean) as ArcadeOrderModelCompat[];
      return { isListed: items.length > 0, listing: items[0] || null };
    },
    initialData: { isListed: false, listing: null } as { isListed: boolean; listing: ArcadeOrderModelCompat | null },
  });
}

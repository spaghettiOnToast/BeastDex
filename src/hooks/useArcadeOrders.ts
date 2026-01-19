import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { getChecksumAddress } from "starknet";
import { CategoryType, StatusType } from "@cartridge/marketplace";

// GraphQL endpoint for arcade-main
const ARCADE_GRAPHQL_ENDPOINT = "https://api.cartridge.gg/x/arcade-main/torii/graphql";

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

function parseGraphQLOrder(node: any): ArcadeOrderModelCompat | null {
  if (!node) return null;

  const id = Number(node.id ?? 0);
  const expiration = parseInt(node.expiration ?? "0", 16);
  const tokenId = parseInt(node.token_id ?? "0", 16);
  const quantity = parseInt(node.quantity ?? "1", 16);
  const price = parseInt(node.price ?? "0", 16);
  const collection = getChecksumAddress(node.collection ?? "0x0");
  const currency = getChecksumAddress(node.currency ?? "0x0");
  const owner = getChecksumAddress(node.owner ?? "0x0");

  // Map numeric indices to enums
  const catIndex = Number(node.category ?? 0);
  const statIndex = Number(node.status ?? 0);
  const categoryValue = [CategoryType.None, CategoryType.Buy, CategoryType.Sell][catIndex] ?? CategoryType.None;
  const statusValue = [StatusType.None, StatusType.Placed, StatusType.Canceled, StatusType.Executed][statIndex] ?? StatusType.None;

  return {
    identifier: String(id),
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

async function fetchArcadeOrdersGraphQL(
  collectionAddress: string,
  limit: number = 1000
): Promise<ArcadeOrderModelCompat[]> {
  const query = `
    query GetArcadeOrders($collection: String!, $limit: Int!) {
      arcadeOrderModels(
        where: {
          collection: $collection,
          status: 1,
          category: 2
        },
        limit: $limit
      ) {
        edges {
          node {
            id
            status
            category
            collection
            token_id
            price
            currency
            owner
            expiration
            quantity
          }
        }
      }
    }
  `;

  const response = await fetch(ARCADE_GRAPHQL_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      query,
      variables: {
        collection: collectionAddress,
        limit,
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`GraphQL request failed: ${response.status} ${response.statusText}`);
  }

  const result = await response.json();

  if (result.errors) {
    console.error("[Arcade Orders] GraphQL errors:", result.errors);
    throw new Error(`GraphQL errors: ${result.errors.map((e: any) => e.message).join(", ")}`);
  }

  const edges = result.data?.arcadeOrderModels?.edges ?? [];
  return edges
    .map((edge: any) => parseGraphQLOrder(edge.node))
    .filter(Boolean) as ArcadeOrderModelCompat[];
}

async function fetchArcadeOrderByTokenGraphQL(
  collectionAddress: string,
  tokenId: string
): Promise<ArcadeOrderModelCompat | null> {
  const tokenIdHex = `0x${parseInt(tokenId, 10).toString(16)}`;

  const query = `
    query GetArcadeOrderByToken($collection: String!, $tokenId: String!) {
      arcadeOrderModels(
        where: {
          collection: $collection,
          token_id: $tokenId,
          status: 1,
          category: 2
        },
        limit: 1
      ) {
        edges {
          node {
            id
            status
            category
            collection
            token_id
            price
            currency
            owner
            expiration
            quantity
          }
        }
      }
    }
  `;

  const response = await fetch(ARCADE_GRAPHQL_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      query,
      variables: {
        collection: collectionAddress,
        tokenId: tokenIdHex,
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`GraphQL request failed: ${response.status} ${response.statusText}`);
  }

  const result = await response.json();

  if (result.errors) {
    console.error("[Arcade Orders] GraphQL errors:", result.errors);
    throw new Error(`GraphQL errors: ${result.errors.map((e: any) => e.message).join(", ")}`);
  }

  const edges = result.data?.arcadeOrderModels?.edges ?? [];
  if (edges.length === 0) return null;

  return parseGraphQLOrder(edges[0].node);
}

export function useArcadeListedTokensForCollection(collectionAddress: string) {
  const queryKey = useMemo(() => ["arcadeListedTokens", collectionAddress], [collectionAddress]);

  return useQuery({
    queryKey,
    enabled: !!collectionAddress,
    staleTime: 30_000, // Consider data fresh for 30 seconds
    queryFn: async () => {
      console.log(`[Arcade Orders] Starting GraphQL fetch for collection ${collectionAddress}`);
      const startTime = performance.now();

      try {
        const orders = await fetchArcadeOrdersGraphQL(collectionAddress, 1000);
        const endTime = performance.now();
        console.log(`[Arcade Orders] Fetched ${orders.length} orders in ${(endTime - startTime).toFixed(0)}ms`);
        return orders;
      } catch (error) {
        console.error('[Arcade Orders] Error during fetch:', error);
        throw error;
      }
    },
  });
}

export function useArcadeIsTokenListed(collectionAddress: string, tokenId: string) {
  const queryKey = useMemo(() => ["arcadeIsTokenListed", collectionAddress, tokenId], [collectionAddress, tokenId]);

  return useQuery({
    queryKey,
    enabled: !!collectionAddress && !!tokenId,
    queryFn: async () => {
      const listing = await fetchArcadeOrderByTokenGraphQL(collectionAddress, tokenId);
      return { isListed: listing !== null, listing };
    },
    initialData: { isListed: false, listing: null } as { isListed: boolean; listing: ArcadeOrderModelCompat | null },
  });
}

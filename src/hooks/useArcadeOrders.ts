import { useMemo, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getChecksumAddress } from "starknet";
import { CategoryType, StatusType } from "@cartridge/arcade";
import { compareStarknetAddresses, padStarknetAddress } from "../utils/address";

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
  price: string; // Keep as string to avoid precision loss with large numbers
  currency: string;
  owner: string;
};

function parseGraphQLOrder(node: any): ArcadeOrderModelCompat | null {
  if (!node) return null;

  const id = Number(node.id ?? 0);
  const expiration = parseInt(node.expiration ?? "0", 16);
  const tokenId = parseInt(node.token_id ?? "0", 16);
  const quantity = parseInt(node.quantity ?? "1", 16);
  // Keep price as string to avoid precision loss - convert hex to decimal string
  const priceHex = node.price ?? "0x0";
  const price = BigInt(priceHex).toString();
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

// Extended type that includes listing time
export type ArcadeOrderWithTime = ArcadeOrderModelCompat & {
  listedAt?: number; // Unix timestamp when listed
};

async function fetchArcadeOrdersGraphQL(
  collectionAddress: string,
  limit: number = 1000
): Promise<ArcadeOrderWithTime[]> {
  // Query current active orders first
  const ordersQuery = `
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

  // Query listing events to get creation times
  const listingsQuery = `
    query GetArcadeListings($limit: Int!) {
      arcadeListingModels(
        limit: $limit
      ) {
        edges {
          node {
            order_id
            time
            order {
              collection
            }
          }
        }
      }
    }
  `;

  // Fetch both in parallel
  const [ordersResponse, listingsResponse] = await Promise.all([
    fetch(ARCADE_GRAPHQL_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: ordersQuery,
        variables: { collection: collectionAddress, limit },
      }),
    }),
    fetch(ARCADE_GRAPHQL_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: listingsQuery,
        variables: { limit: limit * 2 }, // Fetch more to ensure coverage
      }),
    }),
  ]);

  if (!ordersResponse.ok) {
    throw new Error(`GraphQL request failed: ${ordersResponse.status} ${ordersResponse.statusText}`);
  }

  const ordersResult = await ordersResponse.json();
  if (ordersResult.errors) {
    throw new Error(`GraphQL errors: ${ordersResult.errors.map((e: any) => e.message).join(", ")}`);
  }

  // Build a map of order_id -> listing time from listing events
  const listingTimeMap = new Map<number, number>();
  if (listingsResponse.ok) {
    const listingsResult = await listingsResponse.json();
    const listingEdges = listingsResult.data?.arcadeListingModels?.edges ?? [];
    for (const edge of listingEdges) {
      const node = edge.node;
      if (!node) continue;
      // Filter by collection
      if (node.order?.collection && !compareStarknetAddresses(node.order.collection, collectionAddress)) continue;
      const orderId = parseInt(node.order_id ?? "0", 10);
      const time = parseInt(node.time ?? "0", 16);
      if (orderId > 0 && time > 0) {
        listingTimeMap.set(orderId, time);
      }
    }
  }

  // Parse orders and enrich with listing times
  const orderEdges = ordersResult.data?.arcadeOrderModels?.edges ?? [];
  const listings: ArcadeOrderWithTime[] = [];

  for (const edge of orderEdges) {
    const order = parseGraphQLOrder(edge.node);
    if (!order) continue;

    // Get listing time from the events map
    const listedAt = listingTimeMap.get(order.id);

    listings.push({
      ...order,
      listedAt,
    });
  }

  return listings;
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
    staleTime: 60_000, // Consider data fresh for 60 seconds
    refetchOnWindowFocus: false, // Prevent refetch on tab switch
    refetchOnMount: false, // Don't refetch if data exists
    queryFn: () => fetchArcadeOrdersGraphQL(collectionAddress, 1000),
  });
}

export function useArcadeIsTokenListed(collectionAddress: string, tokenId: string) {
  const queryKey = useMemo(() => ["arcadeIsTokenListed", collectionAddress, tokenId], [collectionAddress, tokenId]);

  return useQuery({
    queryKey,
    enabled: !!collectionAddress && !!tokenId,
    staleTime: 30_000, // Consider data fresh for 30 seconds
    refetchOnWindowFocus: false, // Prevent refetch on tab switch
    queryFn: async () => {
      const listing = await fetchArcadeOrderByTokenGraphQL(collectionAddress, tokenId);
      return { isListed: listing !== null, listing };
    },
    initialData: { isListed: false, listing: null } as { isListed: boolean; listing: ArcadeOrderModelCompat | null },
  });
}

export type ArcadeSaleCompat = {
  orderId: number;
  order: ArcadeOrderModelCompat;
  from: string;
  to: string;
  time: number;
};

function parseGraphQLSale(node: any): ArcadeSaleCompat | null {
  if (!node || !node.order) return null;

  const order = parseGraphQLOrder(node.order);
  if (!order) return null;

  const orderId = parseInt(node.order_id ?? "0", 10);
  const from = getChecksumAddress(node.from ?? "0x0");
  const to = getChecksumAddress(node.to ?? "0x0");
  const time = parseInt(node.time ?? "0", 16);

  return {
    orderId,
    order,
    from,
    to,
    time,
  };
}

async function fetchArcadeSalesGraphQL(
  collectionAddress: string,
  limit: number = 100
): Promise<ArcadeSaleCompat[]> {
  const query = `
    query GetArcadeSales($limit: Int!) {
      arcadeSaleModels(
        limit: $limit,
        order: { direction: DESC, field: TIME }
      ) {
        edges {
          node {
            order_id
            from
            to
            time
            order {
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
        limit,
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`GraphQL request failed: ${response.status} ${response.statusText}`);
  }

  const result = await response.json();

  if (result.errors) {
    throw new Error(`GraphQL errors: ${result.errors.map((e: any) => e.message).join(", ")}`);
  }

  const edges = result.data?.arcadeSaleModels?.edges ?? [];
  const sales = edges
    .map((edge: any) => parseGraphQLSale(edge.node))
    .filter(Boolean) as ArcadeSaleCompat[];

  // Filter to only include sales for the specified collection
  return sales.filter(sale =>
    compareStarknetAddresses(sale.order.collection, collectionAddress)
  );
}

export function useArcadeSalesForCollection(collectionAddress: string, limit: number = 100) {
  const queryClient = useQueryClient();
  const queryKey = useMemo(() => ["arcadeSales", collectionAddress, limit], [collectionAddress, limit]);

  const query = useQuery({
    queryKey,
    enabled: !!collectionAddress,
    staleTime: 60_000, // Consider data fresh for 60 seconds
    refetchOnWindowFocus: false, // Prevent refetch on tab switch
    refetchOnMount: false, // Don't refetch if data exists
    queryFn: () => fetchArcadeSalesGraphQL(collectionAddress, limit),
  });

  // Force invalidate and refetch (bypasses staleTime)
  const invalidateAndRefetch = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey });
  }, [queryClient, queryKey]);

  return {
    ...query,
    invalidateAndRefetch,
  };
}

/**
 * Fetch user's offers (buy orders) from the Arcade GraphQL API
 */
async function fetchUserOffersGraphQL(
  userAddress: string,
  collectionAddress: string,
  limit: number = 100
): Promise<ArcadeOrderModelCompat[]> {
  // Pad address to 64 hex chars to match GraphQL storage format
  const normalizedOwner = padStarknetAddress(userAddress) ?? userAddress.toLowerCase();

  // Fetch all user offers (category: 1 = Buy order/offer)
  // Don't filter by status so we can show expired offers in the Hidden section
  const query = `
    query GetUserOffers($owner: String!, $limit: Int!) {
      arcadeOrderModels(
        where: {
          owner: $owner,
          category: 1
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
        owner: normalizedOwner,
        limit,
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`GraphQL request failed: ${response.status} ${response.statusText}`);
  }

  const result = await response.json();

  if (result.errors) {
    throw new Error(`GraphQL errors: ${result.errors.map((e: any) => e.message).join(", ")}`);
  }

  const edges = result.data?.arcadeOrderModels?.edges ?? [];
  const offers = edges
    .map((edge: any) => parseGraphQLOrder(edge.node))
    .filter(Boolean) as ArcadeOrderModelCompat[];

  // Filter to only include offers for the specified collection
  return offers.filter(offer =>
    compareStarknetAddresses(offer.collection, collectionAddress)
  );
}

export function useUserOffers(userAddress: string | undefined, collectionAddress: string) {
  const queryKey = useMemo(
    () => ["arcadeUserOffers", userAddress, collectionAddress],
    [userAddress, collectionAddress]
  );

  const query = useQuery({
    queryKey,
    enabled: !!userAddress && !!collectionAddress,
    staleTime: 15_000, // Consider data fresh for 15 seconds (offers change frequently)
    refetchOnWindowFocus: true, // Refetch when user returns to window
    refetchOnMount: true, // Refetch when component mounts to get latest offers
    queryFn: async () => {
      if (!userAddress) return [];
      return fetchUserOffersGraphQL(userAddress, collectionAddress, 100);
    },
  });

  return {
    ...query,
    refetch: query.refetch,
  };
}

/**
 * Fetch offers (buy orders) for a specific token from the Arcade GraphQL API
 */
async function fetchOffersForTokenGraphQL(
  collectionAddress: string,
  tokenId: string,
  limit: number = 50
): Promise<ArcadeOrderModelCompat[]> {
  const tokenIdHex = `0x${parseInt(tokenId, 10).toString(16)}`;

  const query = `
    query GetOffersForToken($collection: String!, $tokenId: String!, $limit: Int!) {
      arcadeOrderModels(
        where: {
          collection: $collection,
          token_id: $tokenId,
          category: 1,
          status: 1
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
        tokenId: tokenIdHex,
        limit,
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`GraphQL request failed: ${response.status} ${response.statusText}`);
  }

  const result = await response.json();

  if (result.errors) {
    throw new Error(`GraphQL errors: ${result.errors.map((e: any) => e.message).join(", ")}`);
  }

  const edges = result.data?.arcadeOrderModels?.edges ?? [];
  const offers = edges
    .map((edge: any) => parseGraphQLOrder(edge.node))
    .filter(Boolean) as ArcadeOrderModelCompat[];

  // Filter out expired offers
  const now = Math.floor(Date.now() / 1000);
  return offers.filter(offer => offer.expiration > now);
}

export function useOffersForToken(collectionAddress: string, tokenId: string | undefined, enabled: boolean = true) {
  const queryKey = useMemo(
    () => ["arcadeTokenOffers", collectionAddress, tokenId],
    [collectionAddress, tokenId]
  );

  return useQuery({
    queryKey,
    enabled: enabled && !!collectionAddress && !!tokenId,
    staleTime: 15_000, // Consider data fresh for 15 seconds (offers change frequently)
    refetchOnWindowFocus: false,
    queryFn: async () => {
      if (!tokenId) return [];
      return fetchOffersForTokenGraphQL(collectionAddress, tokenId, 50);
    },
  });
}

/**
 * Fetch all offers (buy orders) for the collection from the Arcade GraphQL API
 * This is used to show all offers received by a seller
 */
async function fetchAllOffersForCollectionGraphQL(
  collectionAddress: string,
  limit: number = 500
): Promise<ArcadeOrderModelCompat[]> {
  const query = `
    query GetAllOffersForCollection($collection: String!, $limit: Int!) {
      arcadeOrderModels(
        where: {
          collection: $collection,
          category: 1,
          status: 1
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
    throw new Error(`GraphQL errors: ${result.errors.map((e: any) => e.message).join(", ")}`);
  }

  const edges = result.data?.arcadeOrderModels?.edges ?? [];
  const offers = edges
    .map((edge: any) => parseGraphQLOrder(edge.node))
    .filter(Boolean) as ArcadeOrderModelCompat[];

  // Filter out expired offers
  const now = Math.floor(Date.now() / 1000);
  const nonExpiredOffers = offers.filter(offer => offer.expiration > now);

  return nonExpiredOffers;
}

export type OfferWithBeastInfo = ArcadeOrderModelCompat & {
  beastName?: string;
};

export function useOffersReceivedForListings(
  collectionAddress: string,
  userListedTokenIds: string[],
  enabled: boolean = true
) {
  const queryKey = useMemo(
    () => ["arcadeOffersReceived", collectionAddress, userListedTokenIds.sort().join(",")],
    [collectionAddress, userListedTokenIds]
  );

  const query = useQuery({
    queryKey,
    enabled: enabled && !!collectionAddress && userListedTokenIds.length > 0,
    staleTime: 30_000, // Consider data fresh for 30 seconds
    refetchOnWindowFocus: false,
    queryFn: async () => {
      if (userListedTokenIds.length === 0) return [];

      // Fetch all offers for the collection
      const allOffers = await fetchAllOffersForCollectionGraphQL(collectionAddress, 500);

      // Filter to only offers on user's listed tokens
      const userTokenIdSet = new Set(userListedTokenIds.map(id => String(id)));
      const offersReceived = allOffers.filter(offer =>
        userTokenIdSet.has(String(offer.tokenId))
      );

      // Sort by price descending (highest first) - compare as BigInt for precision
      return offersReceived.sort((a, b) => {
        const priceA = BigInt(a.price);
        const priceB = BigInt(b.price);
        if (priceB > priceA) return 1;
        if (priceB < priceA) return -1;
        return 0;
      });
    },
  });

  return {
    ...query,
    refetch: query.refetch,
  };
}

/**
 * Fetch sales from the GraphQL API where the user is either the buyer or seller
 */
export function useUserSales(
  userAddress: string | undefined,
  collectionAddress: string,
  enabled: boolean = true
) {
  const queryClient = useQueryClient();
  const queryKey = useMemo(
    () => ["arcadeUserSales", userAddress, collectionAddress],
    [userAddress, collectionAddress]
  );

  const query = useQuery({
    queryKey,
    enabled: enabled && !!userAddress && !!collectionAddress,
    staleTime: 30_000, // Consider data fresh for 30 seconds
    refetchOnWindowFocus: false,
    refetchOnMount: true,
    queryFn: async () => {
      if (!userAddress) return [];

      // Fetch recent sales for the collection
      const sales = await fetchArcadeSalesGraphQL(collectionAddress, 200);

      // Filter to only sales where user is buyer or seller
      const userSales = sales.filter(sale =>
        compareStarknetAddresses(sale.from, userAddress) ||
        compareStarknetAddresses(sale.to, userAddress)
      );

      // Sort by time descending (most recent first)
      return userSales.sort((a, b) => b.time - a.time);
    },
  });

  // Force invalidate and refetch (bypasses staleTime)
  const invalidateAndRefetch = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey });
  }, [queryClient, queryKey]);

  return {
    ...query,
    refetch: query.refetch,
    invalidateAndRefetch,
  };
}

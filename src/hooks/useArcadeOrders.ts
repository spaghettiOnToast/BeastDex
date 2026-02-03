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
  createdAt?: number; // Unix timestamp when the offer was created (from arcadeOfferModels)
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

/**
 * Parse an offer from arcadeOfferModels (has nested order and time field)
 */
function parseGraphQLOffer(node: any): ArcadeOrderModelCompat | null {
  if (!node?.order) return null;

  const order = parseGraphQLOrder(node.order);
  if (!order) return null;

  // Parse the time field (hex string to unix timestamp)
  const time = node.time ? parseInt(node.time, 16) : undefined;

  return {
    ...order,
    createdAt: time,
  };
}

/**
 * Helper for making GraphQL requests with abort signal support
 * Prevents memory leaks when components unmount during requests
 */
async function graphqlFetch<T>(
  query: string,
  variables: Record<string, unknown>,
  signal?: AbortSignal
): Promise<T> {
  const response = await fetch(ARCADE_GRAPHQL_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
    signal,
  });

  if (!response.ok) {
    throw new Error(`GraphQL request failed: ${response.status} ${response.statusText}`);
  }

  const result = await response.json();
  if (result.errors) {
    throw new Error(`GraphQL errors: ${result.errors.map((e: any) => e.message).join(", ")}`);
  }

  return result.data as T;
}

/**
 * Parse a listing from arcadeListingModels (has nested order and time field)
 */
function parseGraphQLListing(node: any): ArcadeOrderWithTime | null {
  if (!node?.order) return null;

  const order = parseGraphQLOrder(node.order);
  if (!order) return null;

  // Parse the time field (hex string to unix timestamp)
  const time = node.time ? parseInt(node.time, 16) : undefined;

  return {
    ...order,
    listedAt: time,
  };
}

async function fetchArcadeOrdersGraphQL(
  collectionAddress: string,
  limit: number = 1000,
  signal?: AbortSignal
): Promise<ArcadeOrderWithTime[]> {
  // Query arcadeListingModels directly - has nested order and time field
  const query = `
    query GetArcadeListings($collection: String!, $limit: Int!) {
      arcadeListingModels(
        where: {
          order: {
            collection: $collection,
            status: 1,
            category: 2
          }
        },
        limit: $limit,
        order: { direction: DESC, field: TIME }
      ) {
        edges {
          node {
            order_id
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

  type Response = { arcadeListingModels?: { edges?: Array<{ node: any }> } };
  const data = await graphqlFetch<Response>(
    query,
    { collection: collectionAddress, limit },
    signal
  );

  const edges = data?.arcadeListingModels?.edges ?? [];
  return edges
    .map((edge: any) => parseGraphQLListing(edge.node))
    .filter(Boolean) as ArcadeOrderWithTime[];
}

async function fetchArcadeOrderByTokenGraphQL(
  collectionAddress: string,
  tokenId: string,
  signal?: AbortSignal
): Promise<ArcadeOrderWithTime | null> {
  const tokenIdHex = `0x${parseInt(tokenId, 10).toString(16)}`;

  const query = `
    query GetArcadeListingByToken($collection: String!, $tokenId: String!) {
      arcadeListingModels(
        where: {
          order: {
            collection: $collection,
            token_id: $tokenId,
            status: 1,
            category: 2
          }
        },
        limit: 1
      ) {
        edges {
          node {
            order_id
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

  type Response = { arcadeListingModels?: { edges?: Array<{ node: any }> } };
  const data = await graphqlFetch<Response>(
    query,
    { collection: collectionAddress, tokenId: tokenIdHex },
    signal
  );

  const edges = data?.arcadeListingModels?.edges ?? [];
  if (edges.length === 0) return null;

  return parseGraphQLListing(edges[0].node);
}

export function useArcadeListedTokensForCollection(collectionAddress: string) {
  const queryKey = useMemo(() => ["arcadeListedTokens", collectionAddress], [collectionAddress]);

  return useQuery({
    queryKey,
    enabled: !!collectionAddress,
    staleTime: 5 * 60_000, // Consider data fresh for 5 minutes (prevents background refetches)
    gcTime: 10 * 60_000, // Keep in cache for 10 minutes
    refetchOnWindowFocus: false, // Prevent refetch on window focus
    refetchOnMount: false, // Don't refetch if data exists
    refetchOnReconnect: false, // Don't refetch on reconnect
    queryFn: ({ signal }) => fetchArcadeOrdersGraphQL(collectionAddress, 1000, signal),
  });
}

export function useArcadeIsTokenListed(collectionAddress: string, tokenId: string) {
  const queryKey = useMemo(() => ["arcadeIsTokenListed", collectionAddress, tokenId], [collectionAddress, tokenId]);

  return useQuery({
    queryKey,
    enabled: !!collectionAddress && !!tokenId,
    staleTime: 30_000, // Consider data fresh for 30 seconds
    refetchOnWindowFocus: false, // Prevent refetch on tab switch
    queryFn: async ({ signal }) => {
      const listing = await fetchArcadeOrderByTokenGraphQL(collectionAddress, tokenId, signal);
      return { isListed: listing !== null, listing };
    },
    initialData: { isListed: false, listing: null } as { isListed: boolean; listing: ArcadeOrderWithTime | null },
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
  limit: number = 100,
  signal?: AbortSignal
): Promise<ArcadeSaleCompat[]> {
  // Pad collection address to 64 hex chars for GraphQL filter
  const normalizedCollection = padStarknetAddress(collectionAddress) ?? collectionAddress.toLowerCase();

  const query = `
    query GetArcadeSales($collection: String!, $limit: Int!) {
      arcadeSaleModels(
        where: {
          order: {
            collection: $collection
          }
        },
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

  type Response = { arcadeSaleModels?: { edges?: Array<{ node: any }> } };
  const data = await graphqlFetch<Response>(query, { collection: normalizedCollection, limit }, signal);

  const edges = data?.arcadeSaleModels?.edges ?? [];
  return edges
    .map((edge: any) => parseGraphQLSale(edge.node))
    .filter(Boolean) as ArcadeSaleCompat[];
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
    queryFn: ({ signal }) => fetchArcadeSalesGraphQL(collectionAddress, limit, signal),
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
  limit: number = 100,
  signal?: AbortSignal
): Promise<ArcadeOrderModelCompat[]> {
  // Pad addresses to 64 hex chars to match GraphQL storage format
  const normalizedOwner = padStarknetAddress(userAddress) ?? userAddress.toLowerCase();
  const normalizedCollection = padStarknetAddress(collectionAddress) ?? collectionAddress.toLowerCase();

  // Fetch user offers from arcadeOfferModels (has time field)
  // Filter by order.owner, order.collection, and order.category (1 = Buy order/offer)
  // Don't filter by status so we can show expired offers in the Hidden section
  const query = `
    query GetUserOffers($owner: String!, $collection: String!, $limit: Int!) {
      arcadeOfferModels(
        where: {
          order: {
            owner: $owner,
            collection: $collection,
            category: 1
          }
        },
        limit: $limit,
        order: { direction: DESC, field: TIME }
      ) {
        edges {
          node {
            order_id
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

  type Response = { arcadeOfferModels?: { edges?: Array<{ node: any }> } };
  const data = await graphqlFetch<Response>(
    query,
    { owner: normalizedOwner, collection: normalizedCollection, limit },
    signal
  );

  const edges = data?.arcadeOfferModels?.edges ?? [];
  return edges
    .map((edge: any) => parseGraphQLOffer(edge.node))
    .filter(Boolean) as ArcadeOrderModelCompat[];
}

export function useUserOffers(userAddress: string | undefined, collectionAddress: string) {
  const queryKey = useMemo(
    () => ["arcadeUserOffers", userAddress, collectionAddress],
    [userAddress, collectionAddress]
  );

  const query = useQuery({
    queryKey,
    enabled: !!userAddress && !!collectionAddress,
    staleTime: 2 * 60_000, // Consider data fresh for 2 minutes
    gcTime: 10 * 60_000, // Keep in cache for 10 minutes
    refetchOnWindowFocus: false, // Don't refetch on window focus (prevents flicker)
    refetchOnMount: false, // Don't refetch if data exists (prevents tab switch reload)
    queryFn: async ({ signal }) => {
      if (!userAddress) return [];
      return fetchUserOffersGraphQL(userAddress, collectionAddress, 100, signal);
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
  limit: number = 50,
  signal?: AbortSignal
): Promise<ArcadeOrderModelCompat[]> {
  const tokenIdHex = `0x${parseInt(tokenId, 10).toString(16)}`;

  const query = `
    query GetOffersForToken($collection: String!, $tokenId: String!, $limit: Int!) {
      arcadeOfferModels(
        where: {
          order: {
            collection: $collection,
            token_id: $tokenId,
            category: 1,
            status: 1
          }
        },
        limit: $limit,
        order: { direction: DESC, field: TIME }
      ) {
        edges {
          node {
            order_id
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

  type Response = { arcadeOfferModels?: { edges?: Array<{ node: any }> } };
  const data = await graphqlFetch<Response>(
    query,
    { collection: collectionAddress, tokenId: tokenIdHex, limit },
    signal
  );

  const edges = data?.arcadeOfferModels?.edges ?? [];
  const offers = edges
    .map((edge: any) => parseGraphQLOffer(edge.node))
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
    queryFn: async ({ signal }) => {
      if (!tokenId) return [];
      return fetchOffersForTokenGraphQL(collectionAddress, tokenId, 50, signal);
    },
  });
}

/**
 * Fetch all offers (buy orders) for the collection from the Arcade GraphQL API
 * This is used to show all offers received by a seller
 */
async function fetchAllOffersForCollectionGraphQL(
  collectionAddress: string,
  limit: number = 500,
  signal?: AbortSignal
): Promise<ArcadeOrderModelCompat[]> {
  const query = `
    query GetAllOffersForCollection($collection: String!, $limit: Int!) {
      arcadeOfferModels(
        where: {
          order: {
            collection: $collection,
            category: 1,
            status: 1
          }
        },
        limit: $limit,
        order: { direction: DESC, field: TIME }
      ) {
        edges {
          node {
            order_id
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

  type Response = { arcadeOfferModels?: { edges?: Array<{ node: any }> } };
  const data = await graphqlFetch<Response>(
    query,
    { collection: collectionAddress, limit },
    signal
  );

  const edges = data?.arcadeOfferModels?.edges ?? [];
  const offers = edges
    .map((edge: any) => parseGraphQLOffer(edge.node))
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
  // Use stable query key - just the collection address
  // This prevents cache invalidation when token IDs change
  // Filtering happens client-side via select
  const queryKey = useMemo(
    () => ["arcadeAllOffers", collectionAddress],
    [collectionAddress]
  );

  // Memoize token IDs set for client-side filtering
  const tokenIdSet = useMemo(
    () => new Set(userListedTokenIds.map(id => String(id))),
    [userListedTokenIds]
  );

  const query = useQuery({
    queryKey,
    // Only require collection address - don't depend on token IDs for enabling
    // This allows cache to persist across tab switches
    enabled: enabled && !!collectionAddress,
    staleTime: 2 * 60_000, // Consider data fresh for 2 minutes
    gcTime: 10 * 60_000, // Keep in cache for 10 minutes
    refetchOnWindowFocus: false,
    refetchOnMount: false, // Don't refetch if data exists (prevents tab switch reload)
    queryFn: async ({ signal }) => {
      // Fetch all offers for the collection (stable cache)
      return fetchAllOffersForCollectionGraphQL(collectionAddress, 500, signal);
    },
    // Client-side filtering based on user's token IDs
    // This updates instantly when token IDs change without refetching
    select: useCallback((allOffers: ArcadeOrderModelCompat[]) => {
      if (tokenIdSet.size === 0) return [];

      // Filter to only offers on user's tokens
      const offersReceived = allOffers.filter(offer =>
        tokenIdSet.has(String(offer.tokenId))
      );

      // Sort by price descending (highest first) - compare as BigInt for precision
      return offersReceived.sort((a, b) => {
        const priceA = BigInt(a.price);
        const priceB = BigInt(b.price);
        if (priceB > priceA) return 1;
        if (priceB < priceA) return -1;
        return 0;
      });
    }, [tokenIdSet]),
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
    queryFn: async ({ signal }) => {
      if (!userAddress) return [];

      // Fetch recent sales for the collection
      const sales = await fetchArcadeSalesGraphQL(collectionAddress, 200, signal);

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

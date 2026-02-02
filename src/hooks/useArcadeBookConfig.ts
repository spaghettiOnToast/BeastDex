import { useQuery } from "@tanstack/react-query";

const ARCADE_TORII_GRAPHQL =
  (import.meta.env.VITE_ARCADE_TORII_BASE as string) + "/graphql" ||
  "https://api.cartridge.gg/x/arcade-main/torii/graphql";

export interface BookConfig {
  id: number;
  version: number;
  paused: boolean;
  counter: number;
  royalties: boolean;
  fee_num: number; // Platform fee in basis points (10000 = 100%)
  fee_receiver: string;
}

interface BookQueryResponse {
  data?: {
    arcadeBookModels?: {
      edges: Array<{
        node: BookConfig;
      }>;
    };
  };
  errors?: Array<{ message: string }>;
}

const BOOK_QUERY = `{
  arcadeBookModels {
    edges {
      node {
        id
        version
        paused
        counter
        royalties
        fee_num
        fee_receiver
      }
    }
  }
}`;

async function fetchBookConfig(): Promise<BookConfig | null> {
  try {
    const response = await fetch(ARCADE_TORII_GRAPHQL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: BOOK_QUERY }),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const result: BookQueryResponse = await response.json();

    if (result.errors?.length) {
      console.warn("[useArcadeBookConfig] GraphQL errors:", result.errors);
      return null;
    }

    const edges = result.data?.arcadeBookModels?.edges;
    if (!edges?.length) {
      return null;
    }

    return edges[0].node;
  } catch (error) {
    console.warn("[useArcadeBookConfig] Failed to fetch book config:", error);
    return null;
  }
}

/**
 * Hook to fetch the Arcade marketplace Book configuration
 * Contains platform fee settings that are controlled by Cartridge
 */
export function useArcadeBookConfig() {
  const { data: bookConfig, isLoading, error } = useQuery({
    queryKey: ["arcade-book-config"],
    queryFn: fetchBookConfig,
    staleTime: 60 * 60 * 1000, // Cache for 60 minutes
    gcTime: 120 * 60 * 1000, // Keep in cache for 2 hours
    refetchOnWindowFocus: false,
    retry: 2,
  });

  // Calculate platform fee percentage from basis points
  const platformFeeBP = bookConfig?.fee_num ?? 0;
  const platformFeePercent = platformFeeBP / 100; // 250 -> 2.5%

  return {
    bookConfig,
    isLoading,
    error,
    // Convenience values
    platformFeeBP,
    platformFeePercent,
    platformFeeReceiver: bookConfig?.fee_receiver ?? null,
    royaltiesEnabled: bookConfig?.royalties ?? true,
    isPaused: bookConfig?.paused ?? false,
  };
}

/**
 * Default/fallback values when Torii is unavailable
 * These should match what's currently configured on-chain
 */
export const DEFAULT_BOOK_CONFIG: BookConfig = {
  id: 1,
  version: 1,
  paused: false,
  counter: 0,
  royalties: true,
  fee_num: 0, // Currently 0% on arcade-main
  fee_receiver: "0x3f7f4e5a23a712787f0c100f02934c4a88606b7f0c880c2fd43e817e6275d83",
};

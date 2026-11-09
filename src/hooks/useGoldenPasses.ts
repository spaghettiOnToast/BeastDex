import { useQuery } from "@tanstack/react-query";
import {
  fetchGoldenPassConfig,
  fetchGoldenPassStatuses,
  fetchOwnedGoldenTokenIds,
  type GoldenPassConfig,
  type GoldenPassStatus,
} from "../services/adventurers/goldenPass";

export type GoldenPasses = { config: GoldenPassConfig; passes: GoldenPassStatus[] };

/** The wallet's Golden Tokens and whether each can mint a Beast Mode game right now. */
export function useGoldenPasses(address: string | undefined) {
  return useQuery<GoldenPasses>({
    queryKey: ["goldenPasses", address?.toLowerCase()],
    enabled: !!address,
    staleTime: 60_000,
    queryFn: async () => {
      const [config, ids] = await Promise.all([fetchGoldenPassConfig(), fetchOwnedGoldenTokenIds(address!)]);
      return { config, passes: await fetchGoldenPassStatuses(ids, config.cooldownS) };
    },
  });
}

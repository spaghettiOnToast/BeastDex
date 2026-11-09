import { useQuery } from "@tanstack/react-query";
import {
  fetchGoldenPassConfig,
  fetchGoldenPassStatuses,
  fetchOwnedGoldenTokenIds,
  summarizeGoldenPasses,
  type GoldenPassConfig,
  type GoldenPassStatus,
  type GoldenPassSummary,
} from "../services/adventurers/goldenPass";

export type GoldenPasses = { config: GoldenPassConfig; passes: GoldenPassStatus[]; summary: GoldenPassSummary };

/** The wallet's Golden Tokens and whether each can mint a Beast Mode game right now. */
export function useGoldenPasses(address: string | undefined) {
  return useQuery<GoldenPasses>({
    queryKey: ["goldenPasses", address?.toLowerCase()],
    enabled: !!address,
    staleTime: 60_000,
    queryFn: async () => {
      const [config, ids] = await Promise.all([fetchGoldenPassConfig(), fetchOwnedGoldenTokenIds(address!)]);
      const passes = await fetchGoldenPassStatuses(ids, config.cooldownS);
      return { config, passes, summary: summarizeGoldenPasses(passes) };
    },
  });
}

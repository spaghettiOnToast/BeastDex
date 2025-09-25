import { useEffect, useMemo, useState } from "react";
import { usernameCache } from "../services/usernameCache";
import { normaliseStarknetAddresses } from "../utils/address";
import { getErrorMessage } from "../utils/error";

export type ControllerUsernamesState = {
  usernames: Record<string, string>;
  loading: boolean;
  error: string | null;
};

export function useControllerUsernames(addresses: Array<string | null | undefined>) {
  const [state, setState] = useState<ControllerUsernamesState>({
    usernames: {},
    loading: false,
    error: null,
  });

  const uniqueAddresses = useMemo(() => {
    return normaliseStarknetAddresses(addresses);
  }, [addresses]);

  useEffect(() => {
    if (uniqueAddresses.length === 0) {
      setState({ usernames: {}, loading: false, error: null });
      return;
    }

    let cancelled = false;

    async function run() {
      setState((prev) => ({ ...prev, loading: true, error: null }));
      try {
        const result = await usernameCache.getUsernames(uniqueAddresses);
        if (cancelled) return;
        setState({ usernames: result, loading: false, error: null });
      } catch (error: unknown) {
        if (cancelled) return;
        setState({
          usernames: {},
          loading: false,
          error: getErrorMessage(error, "Failed to fetch usernames"),
        });
      }
    }

    run();

    return () => {
      cancelled = true;
    };
  }, [uniqueAddresses]);

  return state;
}

import { useEffect, useMemo, useState } from "react";
import { usernameCache } from "../services/usernameCache";
import { normaliseStarknetAddresses } from "../utils/address";
import { getErrorMessage } from "../utils/error";

export type ControllerUsernamesState = {
  usernames: Record<string, string>;
  loading: boolean;
  error: string | null;
};

export type ControllerUsernamesOptions = {
  /** Delay in ms before fetching usernames (allows UI to render first) */
  delayMs?: number;
};

export function useControllerUsernames(
  addresses: Array<string | null | undefined>,
  options: ControllerUsernamesOptions = {}
) {
  const { delayMs = 0 } = options;

  const [state, setState] = useState<ControllerUsernamesState>({
    usernames: {},
    loading: false,
    error: null,
  });

  // Stringify addresses to create a stable dependency key
  // (arrays change reference on every render even if values are the same)
  const addressesKey = addresses.filter(Boolean).join(",");

  const uniqueAddresses = useMemo(() => {
    return normaliseStarknetAddresses(addresses);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- addressesKey is a stable string representation of addresses
  }, [addressesKey]);

  useEffect(() => {
    if (uniqueAddresses.length === 0) {
      setState({ usernames: {}, loading: false, error: null });
      return;
    }

    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

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

    if (delayMs > 0) {
      // Defer username lookup to allow UI to render first
      timeoutId = setTimeout(() => {
        if (!cancelled) run();
      }, delayMs);
    } else {
      run();
    }

    return () => {
      cancelled = true;
      if (timeoutId) clearTimeout(timeoutId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- addressesKey captures when uniqueAddresses changes
  }, [addressesKey, delayMs]);

  return state;
}

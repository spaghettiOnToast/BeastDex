import { useCallback, useEffect, useRef, useState } from "react";

export type ApiState<T> = {
  data: T | null;
  loading: boolean;
  error: string | null;
};

export type UseApiOptions = {
  enabled?: boolean;
  immediate?: boolean;
};

export function useApi<T>(
  apiFn: () => Promise<T>,
  deps: React.DependencyList = [],
  options: UseApiOptions = {}
): ApiState<T> & { refetch: () => Promise<void> } {
  const { enabled = true, immediate = true } = options;
  const [state, setState] = useState<ApiState<T>>({
    data: null,
    loading: immediate && enabled,
    error: null,
  });

  const requestIdRef = useRef(0);
  // Store apiFn in a ref to avoid stale closures in the effect
  const apiFnRef = useRef(apiFn);
  apiFnRef.current = apiFn;

  const refetch = useCallback(async () => {
    if (!enabled) return;

    requestIdRef.current += 1;
    const currentRequestId = requestIdRef.current;

    setState(prev => ({ ...prev, loading: true, error: null }));

    try {
      const result = await apiFnRef.current();

      if (currentRequestId === requestIdRef.current) {
        setState({ data: result, loading: false, error: null });
      }
    } catch (error) {
      if (currentRequestId === requestIdRef.current) {
        setState({
          data: null,
          loading: false,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }, [enabled]);

  useEffect(() => {
    if (immediate && enabled) {
      refetch();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, enabled, immediate]);

  return {
    ...state,
    refetch,
  };
}
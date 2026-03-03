import { useApi } from "./useApi";
import {
  fetchBeastStats,
  fetchBeastHighlights,
  fetchBeastAttributeFilters,
} from "../services/beast";

export function useBeastStats(enabled: boolean = true) {
  return useApi(
    fetchBeastStats,
    [],
    { enabled, immediate: enabled }
  );
}

export function useBeastHighlights(enabled: boolean = true) {
  return useApi(
    fetchBeastHighlights,
    [],
    { enabled, immediate: enabled }
  );
}

export function useBeastAttributeFilters(enabled: boolean = true) {
  return useApi(
    fetchBeastAttributeFilters,
    [],
    { enabled, immediate: enabled }
  );
}

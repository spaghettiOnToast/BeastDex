import { useApi } from "./useApi";
import {
  fetchBeastStats,
  fetchBeastHighlights,
  fetchBeastAttributeFilters,
  fetchBeastSpecies,
} from "../services/beast";
import { ORIGINAL_SPECIES_COUNT } from "../utils/beastCollection";

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

/** Species catalog (v3 registry; open-ended). */
export function useBeastSpecies(enabled: boolean = true) {
  return useApi(fetchBeastSpecies, [], { enabled, immediate: enabled });
}

/**
 * Number of registered species. v3 species are open-ended, so this replaces the
 * old fixed 75; falls back to ORIGINAL_SPECIES_COUNT while loading or on error.
 */
export function useSpeciesCount(): number {
  const { data } = useBeastSpecies();
  return data && data.length > 0 ? data.length : ORIGINAL_SPECIES_COUNT;
}

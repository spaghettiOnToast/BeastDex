/**
 * Hooks Index
 *
 * Re-exports all custom hooks for easier importing.
 */

// Data fetching hooks
export { useBeasts } from "./useBeasts";
export { useBeastFilters } from "./useBeastFilters";
export { useUserBeasts, type UseUserBeastsOptions, type UseUserBeastsResult } from "./useUserBeasts";
export { useControllerUsernames } from "./useControllerUsernames";
export { useArcadeListedTokensForCollection } from "./useArcadeOrders";

// UI state hooks
export { useDialog, type DialogState } from "./useDialog";

// Global state
export { GlobalSearchProvider, useGlobalSearch } from "./useGlobalSearch";

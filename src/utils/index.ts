/**
 * Utilities Index
 *
 * Re-exports all utility functions for easier importing.
 */

// Address utilities
export {
  normaliseStarknetAddress,
  normaliseStarknetAddresses,
  padStarknetAddress,
  padStarknetAddresses,
  compareStarknetAddresses,
} from "./address";

// Beast utilities
export {
  getAttributeValues,
  getAttributeValue,
  getNumericAttribute,
  hasAttributeValue,
  matchesBeastFilters,
  getBeastType,
  getBeastTier,
  getBeastHealth,
  getBeastRank,
  getBeastLastDeathTimestamp,
} from "./beast";

// Sorting utilities
export { sortListings, sortBeasts } from "./sort";

// BigInt utilities
export { toBigIntSafe } from "./bigint";

// Price utilities
export { formatPrice } from "./price";

// Error utilities
export { getErrorMessage, isSqlEndpointError, getUserFriendlyErrorMessage } from "./error";

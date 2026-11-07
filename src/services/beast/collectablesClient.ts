import { CollectablesClient } from "@provable-games/collectables";

/**
 * Collectables API serving the Beasts v3 (MOBs) collection — the same
 * deployment lootsurvivor.io's collectables page uses. The SDK's built-in
 * default URL still serves the LEGACY collection, so always pass a base URL.
 */
export const DEFAULT_COLLECTABLES_API_URL = "https://api-next-5655.up.railway.app";

export const COLLECTABLES_API_URL =
  (import.meta.env.VITE_COLLECTABLES_API_URL as string | undefined)?.trim() ||
  DEFAULT_COLLECTABLES_API_URL;

export const collectablesClient = new CollectablesClient({ baseUrl: COLLECTABLES_API_URL });

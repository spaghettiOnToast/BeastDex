/**
 * Summit API URL Configuration
 *
 * Dev: proxied through Vite at /summit-api → Railway production
 * Prod: direct to Railway or overridden via VITE_SUMMIT_API_URL
 */

const DEFAULT_SUMMIT_API_URL = import.meta.env.DEV
  ? "/summit-api"
  : "https://summit-api-production.up.railway.app";

/**
 * Summit (the legacy-beasts game) data is only fetched when an API is
 * explicitly configured. Its default Railway service was retired with the
 * Beasts v3 migration, so Summit features (rank, Summit tab, unclaimed skulls)
 * are off unless VITE_SUMMIT_API_URL is set.
 */
export const SUMMIT_ENABLED = Boolean((import.meta.env.VITE_SUMMIT_API_URL as string | undefined)?.trim());

export const SUMMIT_API_URL =
  (import.meta.env.VITE_SUMMIT_API_URL as string | undefined)?.trim() ||
  DEFAULT_SUMMIT_API_URL;

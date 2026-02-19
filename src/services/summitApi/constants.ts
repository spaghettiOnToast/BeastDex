/**
 * Summit API URL Configuration
 *
 * Dev: proxied through Vite at /summit-api → Railway production
 * Prod: direct to Railway or overridden via VITE_SUMMIT_API_URL
 */

const DEFAULT_SUMMIT_API_URL = import.meta.env.DEV
  ? "/summit-api"
  : "https://summit-api-production.up.railway.app";

export const SUMMIT_API_URL =
  (import.meta.env.VITE_SUMMIT_API_URL as string | undefined)?.trim() ||
  DEFAULT_SUMMIT_API_URL;

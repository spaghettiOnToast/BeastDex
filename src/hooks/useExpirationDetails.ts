import { useCallback, useMemo, useState, useEffect } from "react";
import {
  DEFAULT_LISTING_DURATION_SECONDS,
  LISTING_DURATION_OPTIONS,
} from "../services/marketplace/constants";

/** Value used for custom duration selection */
export const CUSTOM_DURATION_VALUE = "custom";

/** Default duration value as string for select components */
export const DEFAULT_DURATION_VALUE = String(DEFAULT_LISTING_DURATION_SECONDS);

/** Duration select options including custom option */
export const DURATION_SELECT_OPTIONS = [
  ...LISTING_DURATION_OPTIONS.map((option) => ({
    label: option.label,
    value: String(option.value),
  })),
  { label: "Custom date…", value: CUSTOM_DURATION_VALUE },
] as const;

export type ExpirationDetails = {
  /** Unix timestamp in seconds, or null if invalid */
  expirationSeconds: number | null;
  /** Error message if expiration is invalid */
  error: string | null;
  /** Human-readable preview of the expiration date/time */
  preview: string | null;
};

export type UseExpirationDetailsOptions = {
  /** Whether to enforce max expiration (default: false) */
  enforceMaxExpiration?: boolean;
  /** Custom max duration in seconds (default: DEFAULT_LISTING_DURATION_SECONDS) */
  maxDurationSeconds?: number;
};

export type UseExpirationDetailsReturn = {
  /** Current duration value (select value) */
  duration: string;
  /** Set the duration value */
  setDuration: (value: string) => void;
  /** Custom expiration date string (YYYY-MM-DD format) */
  customExpiration: string;
  /** Set the custom expiration date */
  setCustomExpiration: (value: string) => void;
  /** Minimum allowed custom expiration date (tomorrow) */
  minCustomExpiration: string;
  /** Computed expiration details */
  expirationDetails: ExpirationDetails;
  /** Whether the custom duration option is selected */
  isCustomDuration: boolean;
  /** Reset to defaults (useful when dialog opens) */
  reset: () => void;
};

/**
 * Converts a Date to YYYY-MM-DD format for date input
 */
function toLocalDateValue(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Hook for managing listing/offer duration and expiration logic.
 *
 * Consolidates the duration/expiration logic used across:
 * - ListDialog
 * - CartListDialog
 * - EditListingDialog
 * - MakeOfferDialog
 *
 * @param options - Configuration options
 * @returns State and computed values for expiration handling
 */
export function useExpirationDetails(
  options: UseExpirationDetailsOptions = {}
): UseExpirationDetailsReturn {
  const {
    enforceMaxExpiration = false,
    maxDurationSeconds = DEFAULT_LISTING_DURATION_SECONDS,
  } = options;

  const [duration, setDuration] = useState<string>(DEFAULT_DURATION_VALUE);
  const [customExpiration, setCustomExpiration] = useState("");

  // Clear custom expiration when switching away from custom mode
  useEffect(() => {
    if (duration !== CUSTOM_DURATION_VALUE) {
      setCustomExpiration("");
    }
  }, [duration]);

  // Minimum custom expiration date (tomorrow)
  const minCustomExpiration = useMemo(() => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    return toLocalDateValue(tomorrow);
  }, []);

  // Compute expiration details
  const expirationDetails = useMemo((): ExpirationDetails => {
    const nowSeconds = Math.floor(Date.now() / 1000);

    if (duration === CUSTOM_DURATION_VALUE) {
      if (!customExpiration) {
        return {
          expirationSeconds: null,
          error: "Select an expiration date.",
          preview: null,
        };
      }

      // Parse date and set to end of day (23:59:59)
      const [year, month, day] = customExpiration.split("-").map(Number);
      const expirationDate = new Date(year, month - 1, day, 23, 59, 59);
      const seconds = Math.floor(expirationDate.getTime() / 1000);

      if (Number.isNaN(seconds)) {
        return {
          expirationSeconds: null,
          error: "Unable to parse the chosen date.",
          preview: null,
        };
      }

      if (seconds <= nowSeconds) {
        return {
          expirationSeconds: null,
          error: "Expiration must be in the future.",
          preview: null,
        };
      }

      // Enforce max expiration if configured
      if (enforceMaxExpiration) {
        const maxSeconds = nowSeconds + maxDurationSeconds;
        if (seconds > maxSeconds) {
          const maxDays = Math.floor(maxDurationSeconds / (60 * 60 * 24));
          return {
            expirationSeconds: null,
            error: `Max expiration is ${maxDays} days from now.`,
            preview: null,
          };
        }
      }

      return {
        expirationSeconds: seconds,
        error: null,
        preview: expirationDate.toLocaleDateString(),
      };
    }

    // Standard duration option
    const parsedDuration = Number.parseInt(duration, 10);
    if (!Number.isFinite(parsedDuration) || parsedDuration <= 0) {
      return {
        expirationSeconds: null,
        error: "Choose a valid listing duration.",
        preview: null,
      };
    }

    const seconds = nowSeconds + parsedDuration;
    return {
      expirationSeconds: seconds,
      error: null,
      preview: new Date(seconds * 1000).toLocaleString(),
    };
  }, [customExpiration, duration, enforceMaxExpiration, maxDurationSeconds]);

  const reset = useCallback(() => {
    setDuration(DEFAULT_DURATION_VALUE);
    setCustomExpiration("");
  }, []);

  return {
    duration,
    setDuration,
    customExpiration,
    setCustomExpiration,
    minCustomExpiration,
    expirationDetails,
    isCustomDuration: duration === CUSTOM_DURATION_VALUE,
    reset,
  };
}

/**
 * User rejection detection utility
 *
 * Consolidates user rejection error detection patterns from various wallet providers.
 * Different wallets (Argent, Braavos, Cartridge Controller) use different error messages
 * to indicate that a user cancelled/rejected a transaction.
 */

/**
 * Checks if an error indicates that the user rejected/cancelled the transaction.
 * Handles various wallet error message formats.
 *
 * @param error - The error to check (can be Error, unknown, or any type)
 * @returns true if the error indicates user rejection, false otherwise
 */
export function isUserRejection(error: unknown): boolean {
  const message = getErrorMessage(error).toLowerCase();

  // Direct matches for common rejection patterns
  if (
    message.includes("user rejected") ||
    message.includes("user cancelled") ||
    message.includes("user canceled") ||
    message.includes("user denied") ||
    message.includes("user abort") ||
    message.includes("rejected by user") ||
    message.includes("cancelled by user") ||
    message.includes("canceled by user") ||
    message.includes("aborted by user") ||
    message.includes("transaction was rejected") ||
    message.includes("request rejected")
  ) {
    return true;
  }

  // Cartridge Controller specific patterns
  if (
    message.includes("popup closed") ||
    message.includes("popup was closed") ||
    message.includes("session cancelled") ||
    message.includes("session canceled") ||
    message.includes("closed by user") ||
    message.includes("dismissed") ||
    message.includes("modal closed") ||
    message.includes("dialog closed") ||
    message.includes("timed out") ||
    message.includes("wallet may have been closed")
  ) {
    return true;
  }

  // Flexible pattern: "user" + any rejection-related word
  if (
    message.includes("user") &&
    (message.includes("reject") ||
      message.includes("cancel") ||
      message.includes("abort") ||
      message.includes("denied") ||
      message.includes("close"))
  ) {
    return true;
  }

  return false;
}

/**
 * Extracts the error message from various error types
 */
function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === "string") {
    return error;
  }
  if (error && typeof error === "object" && "message" in error) {
    return String((error as { message: unknown }).message);
  }
  return "";
}

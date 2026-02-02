export function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "string" && error.trim().length > 0) {
    return error.trim();
  }

  return fallback;
}

export function isSqlEndpointError(error: unknown): boolean {
  const message = getErrorMessage(error, "");
  return (
    message.includes("SQL API error") ||
    message.includes("SQL request failed") ||
    message.includes("pg-beasts") ||
    message.includes("Failed to fetch data for")
  );
}

export function getUserFriendlyErrorMessage(error: unknown, fallback: string): string {
  // Check if this is a SQL endpoint error
  if (isSqlEndpointError(error)) {
    return "Beast data is temporarily unavailable. Our indexing service is experiencing issues. Please try again in a few minutes.";
  }

  // Return the original error message for other types of errors
  return getErrorMessage(error, fallback);
}

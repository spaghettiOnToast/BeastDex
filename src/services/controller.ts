import { normaliseStarknetAddresses } from "../utils/address";

/**
 * Cartridge's Controller username API. Cartridge is winding down, so this is
 * best-effort: lookups time out quickly and, after a failure, are skipped for a
 * while (callers then show addresses instead of usernames).
 */
const LOOKUP_ENDPOINT =
  (import.meta.env.VITE_ACCOUNTS_LOOKUP_URL as string | undefined)?.trim() ||
  "https://api.cartridge.gg/accounts/lookup";
const LOOKUP_TIMEOUT_MS = 5_000;
const LOOKUP_BACKOFF_MS = 5 * 60_000;
let lookupDownUntil = 0;

type LookupRequest = {
  usernames?: string[];
  addresses?: string[];
};

type LookupResponse = {
  results?: Array<{
    username?: string;
    addresses?: string[];
  }>;
};

const addressToUsernameCache = new Map<string, string>();
const usernameToAddressesCache = new Map<string, string[]>();

function normaliseUsername(username: string) {
  return username.trim().toLowerCase();
}

async function executeLookup(request: LookupRequest) {
  const hasAddresses = Array.isArray(request.addresses) && request.addresses.length > 0;
  const hasUsernames = Array.isArray(request.usernames) && request.usernames.length > 0;

  if (!hasAddresses && !hasUsernames) {
    return;
  }

  if (Date.now() < lookupDownUntil) return;

  let payload: LookupResponse;
  try {
    const response = await fetch(LOOKUP_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(request),
      signal: AbortSignal.timeout(LOOKUP_TIMEOUT_MS),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    payload = (await response.json()) as LookupResponse;
  } catch (err) {
    // Degrade to addresses; don't hammer a dead/slow endpoint.
    lookupDownUntil = Date.now() + LOOKUP_BACKOFF_MS;
    console.warn("[usernames] lookup unavailable, showing addresses for now:", err);
    return;
  }

  payload?.results?.forEach((result) => {
    const username = typeof result?.username === "string" ? result.username : null;
    const normalisedUsername = username ? normaliseUsername(username) : null;
    const addresses = Array.isArray(result?.addresses)
      ? normaliseStarknetAddresses(result.addresses)
      : [];

    if (normalisedUsername) {
      usernameToAddressesCache.set(normalisedUsername, addresses);
    }

    addresses.forEach((address) => {
      if (username) {
        addressToUsernameCache.set(address, username);
      }
    });
  });
}

export async function lookupControllerUsernames(
  addresses: Array<string | null | undefined>,
): Promise<Record<string, string>> {
  const uniqueAddresses = normaliseStarknetAddresses(addresses);

  if (uniqueAddresses.length === 0) {
    return {};
  }

  const toFetch = uniqueAddresses.filter(
    (address) => !addressToUsernameCache.has(address),
  );

  if (toFetch.length > 0) {
    await executeLookup({ addresses: toFetch });
  }

  return uniqueAddresses.reduce<Record<string, string>>((acc, address) => {
    const cached = addressToUsernameCache.get(address);
    if (cached) {
      acc[address] = cached;
    }
    return acc;
  }, {});
}

export async function lookupControllerAddresses(
  usernames: Array<string | null | undefined>,
): Promise<Record<string, string[]>> {
  const processed = usernames
    .map((username) => (typeof username === "string" ? username.trim() : ""))
    .filter((username) => username.length > 0);

  const uniqueUsernames = Array.from(new Set(processed));

  if (uniqueUsernames.length === 0) {
    return {};
  }

  const normalisedPairs = uniqueUsernames.map((username) => ({
    original: username,
    normalised: normaliseUsername(username),
  }));

  const toFetch = normalisedPairs
    .filter(({ normalised }) => !usernameToAddressesCache.has(normalised))
    .map(({ original }) => original);

  if (toFetch.length > 0) {
    await executeLookup({ usernames: toFetch });
  }

  return normalisedPairs.reduce<Record<string, string[]>>((acc, { normalised }) => {
    const cached = usernameToAddressesCache.get(normalised) ?? [];
    acc[normalised] = cached;
    return acc;
  }, {});
}

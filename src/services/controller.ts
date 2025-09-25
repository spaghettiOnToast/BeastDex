import { normaliseStarknetAddresses } from "../utils/address";

const LOOKUP_ENDPOINT = "https://api.cartridge.gg/accounts/lookup";

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

  const response = await fetch(LOOKUP_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Username lookup failed: ${response.status} ${text}`);
  }

  const payload = (await response.json()) as LookupResponse;

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

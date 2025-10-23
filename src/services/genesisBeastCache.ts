import { fetchBeastById, type Beast } from "./beast";

// Cache for Genesis beasts (IDs 1-75)
let genesisBeastCache: Map<string, Beast> | null = null;
let cacheLoading = false;
let cachePromise: Promise<Map<string, Beast>> | null = null;

function getBeastTypeKey(beast: Beast): string {
  const attribute = beast.attributes.find(
    (attr) => attr.trait_type?.toLowerCase() === "beast"
  );
  return String(attribute?.value ?? "").trim().toLowerCase();
}

export async function getGenesisBeastCache(): Promise<Map<string, Beast>> {
  // Return cached data if available
  if (genesisBeastCache) {
    return genesisBeastCache;
  }

  // Return existing promise if loading
  if (cacheLoading && cachePromise) {
    return cachePromise;
  }

  // Start loading Genesis beasts
  cacheLoading = true;
  cachePromise = loadGenesisBeasts();

  try {
    genesisBeastCache = await cachePromise;
    return genesisBeastCache;
  } finally {
    cacheLoading = false;
    cachePromise = null;
  }
}

// Helper function to format ID as u256 hex string
function formatBeastId(id: number): string {
  return `0x${id.toString(16).padStart(64, '0')}`;
}

async function loadGenesisBeasts(): Promise<Map<string, Beast>> {
  const genesisMap = new Map<string, Beast>();

  try {
    // Generate Genesis beast IDs as u256 hex strings
    const genesisIds = Array.from({ length: 75 }, (_, i) => formatBeastId(i + 1));

    // Fetch Genesis beasts individually by ID
    const promises = genesisIds.map(async (id) => {
      try {
        const beast = await fetchBeastById(id);
        return beast;
      } catch (error) {
        return null;
      }
    });

    const results = await Promise.all(promises);
    const beasts = results.filter((beast): beast is Beast => beast !== null);

    // Map Genesis beasts by type (store original beast data, not u256 formatted)
    beasts.forEach(beast => {
      const typeKey = getBeastTypeKey(beast);
      if (typeKey && !genesisMap.has(typeKey)) {
        // Store the beast with its original data - the u256 ID was only for fetching
        genesisMap.set(typeKey, beast);
      }
    });

    return genesisMap;

  } catch (error) {
    console.error("Failed to load Genesis beasts:", error);
    // Return empty map on error so the app doesn't break
    return new Map();
  }
}

export function getGenesisBeastForType(beastType: string): Beast | null {
  if (!genesisBeastCache) {
    return null;
  }

  const normalizedType = beastType.toLowerCase().trim();
  return genesisBeastCache.get(normalizedType) || null;
}

// Preload Genesis beasts cache on app startup
export function preloadGenesisBeastCache(): void {
  // Fire and forget - load in background
  getGenesisBeastCache().catch(() => {
    // Silently fail - cache will be loaded on demand
  });
}
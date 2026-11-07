/**
 * Beasts v3 card images, rendered client-side exactly as the chain does.
 *
 * Mirrors lootsurvivor.io's collectables page: the v3 token id encodes the
 * whole immutable card (stats, visual preset, print condition), so we decode
 * it, embed the bundled sprite as a data URI, and run the SDK's port of the
 * on-chain `beast_svg.cairo` renderer. No RPC call per card.
 */
import { beastImageUrl, beastsV3, hasBundledBeastImage, svgToDataUri } from "@provable-games/collectables";
import { fetchBeastSpecies } from "./species";

const COLLECTABLES_BASE_URL = "/collectables";

/**
 * v3 renamed two original species; their bundled sprites keep the legacy file
 * names. (Same mapping lootsurvivor.io uses.)
 */
const SPRITE_NAME_ALIASES: Record<string, string> = {
  Asag: "Balrog",
  Metsavana: "Ent",
};

/** Species name to use for bundled-sprite lookup. */
export function spriteSpeciesName(name: string): string {
  return SPRITE_NAME_ALIASES[name] ?? name;
}

/** Renderer masks the original catalog uses when the registry doesn't report them. */
const ORIGINAL_RAINBOW_PRESETS = 10; // presets 1 and 3
const ORIGINAL_SPECIES_COUNT = 75;

async function rainbowPresetsFor(speciesId: number): Promise<number> {
  try {
    const species = await fetchBeastSpecies();
    const s = species.find((x) => x.speciesId === speciesId);
    if (s?.rainbowPresets != null) return s.rainbowPresets;
  } catch {
    // fall through to the original-catalog default
  }
  return speciesId >= 1 && speciesId <= ORIGINAL_SPECIES_COUNT ? ORIGINAL_RAINBOW_PRESETS : 0;
}

// Sprite URL -> data URI (sprites are shared by every card of a species+variant).
const spriteCache = new Map<string, Promise<string>>();

function spriteDataUri(url: string): Promise<string> {
  let pending = spriteCache.get(url);
  if (!pending) {
    pending = (async () => {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`beast art ${url}: HTTP ${res.status}`);
      const type = res.headers.get("content-type") ?? (url.endsWith(".gif") ? "image/gif" : "image/png");
      const bytes = new Uint8Array(await res.arrayBuffer());
      let bin = "";
      for (let i = 0; i < bytes.length; i += 32768) {
        bin += String.fromCharCode(...bytes.subarray(i, i + 32768));
      }
      return `data:${type};base64,${btoa(bin)}`;
    })();
    pending.catch(() => spriteCache.delete(url));
    spriteCache.set(url, pending);
  }
  return pending;
}

// Rendered cards, LRU-bounded (each is a sizeable data URI).
const CARD_CACHE_MAX = 300;
const cardCache = new Map<string, Promise<string>>();

function cached(key: string, make: () => Promise<string>): Promise<string> {
  const hit = cardCache.get(key);
  if (hit) {
    cardCache.delete(key);
    cardCache.set(key, hit);
    return hit;
  }
  const pending = make();
  pending.catch(() => cardCache.delete(key));
  cardCache.set(key, pending);
  if (cardCache.size > CARD_CACHE_MAX) {
    const oldest = cardCache.keys().next().value;
    if (oldest !== undefined) cardCache.delete(oldest);
  }
  return pending;
}

export type V3CardInput = {
  /** canonical decimal token id */
  tokenId: string;
  /** species name as the registry reports it (e.g. "Asag") */
  speciesName: string;
  prefixName?: string | null;
  suffixName?: string | null;
  /** live rank (not encoded in the token id); 0 draws no rank */
  rank?: number | null;
};

/**
 * `<img src>`-ready data URI of a v3 beast card. Rejects when the species has
 * no bundled sprite (callers fall back to the on-chain token_uri image).
 */
export function fetchV3CardImgSrc(input: V3CardInput): Promise<string> {
  const rank = input.rank ?? 0;
  return cached(`${input.tokenId}:${rank}`, async () => {
    const beast = beastsV3.decodeTokenId(BigInt(input.tokenId));
    const ve = beast.visualEffects;
    const sprite = {
      name: spriteSpeciesName(input.speciesName),
      // Original art: presets 1/3 are the shiny set; every original is a GIF.
      shiny: ve === 1 || ve === 3,
      animated: true,
    };
    if (!hasBundledBeastImage(sprite)) {
      throw new Error(`no bundled sprite for ${input.speciesName}`);
    }
    const [art, rainbowPresets] = await Promise.all([
      spriteDataUri(beastImageUrl(sprite, { baseUrl: COLLECTABLES_BASE_URL })),
      rainbowPresetsFor(Number(beast.speciesId)),
    ]);
    const svg = beastsV3.renderBeastCardV3Svg({
      beast,
      prefixName: input.prefixName ?? "",
      suffixName: input.suffixName ?? "",
      beastName: input.speciesName,
      rank,
      beastImage: art,
      rainbowPresets,
    });
    return svgToDataUri(svg);
  });
}

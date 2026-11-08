/**
 * Festival beasts: one-off ERC721 collections minted by Loot Survivor festival
 * dungeons (Tiddy Mun from the Norwich Games Festival, Black Shuck from the
 * Black Shuck Festival). Small supplies with sequential ids from 1, read
 * straight from chain. Both are freely transferable (no soulbound lock;
 * wallet-to-wallet transfers exist on-chain).
 */
import { byteArray } from "starknet";
import { withReadProvider } from "./tx";
import { apiCache } from "./apiCache";
import { normaliseStarknetAddress } from "../utils/address";
import type { Beast } from "./beast/types";
import type { FestivalListingToken } from "./marketplace/types";

export type FestivalCollection = {
  slug: string;
  name: string;
  /** ERC721 contract */
  address: string;
  /** the dungeon that mints it, on lootsurvivor.io */
  dungeonId: string;
  dungeonName: string;
  accentColor: string;
  blurb: string;
};

export const FESTIVAL_COLLECTIONS: FestivalCollection[] = [
  {
    slug: "black-shuck",
    name: "Black Shuck",
    address: "0x036c11af7ff86f21cef044667d0ef063eac2045f8cc270ce25bbae6a5ab9528e",
    dungeonId: "black-shuck-festival",
    dungeonName: "Black Shuck Festival",
    accentColor: "#ff2d2d",
    blurb: "The black dog of East Anglia, claimed by slaying the hunt at the Black Shuck Festival.",
  },
  {
    slug: "tiddy-mun",
    name: "Tiddy Mun",
    address: "0x0202d78ebda24bde4e44434bcfd2b329d6c0dde25eb2b713a8e7c3e8f4e1a8bb",
    dungeonId: "norwich-games-festival",
    dungeonName: "Norwich Games Festival",
    accentColor: "#80ff00",
    blurb: "Exclusive beasts collected with QR leaflets at the Norwich Games Festival.",
  },
];

/** Festival collection for a contract address, if it is one. */
export function festivalCollectionFor(address: string | null | undefined): FestivalCollection | null {
  if (!address) return null;
  try {
    const target = BigInt(address);
    return FESTIVAL_COLLECTIONS.find((c) => BigInt(c.address) === target) ?? null;
  } catch {
    return null;
  }
}

/** Marketplace filter trait for festival tokens (Yes = festival only, No = Beasts only). */
export const FESTIVAL_FILTER_TRAIT = "Festival";

export function getFestivalCollection(slug: string | undefined): FestivalCollection | null {
  return FESTIVAL_COLLECTIONS.find((c) => c.slug === slug) ?? null;
}

export type FestivalAttribute = { trait_type: string; value: string | number };

export type FestivalTokenMeta = {
  name: string;
  description: string | null;
  image: string;
  animationUrl: string | null;
  attributes: FestivalAttribute[];
};

export type FestivalToken = {
  tokenId: number;
  meta: FestivalTokenMeta | null;
  owner: string | null;
};

const u256 = (id: number) => [`0x${id.toString(16)}`, "0x0"];

async function call(address: string, entrypoint: string, calldata: string[] = []): Promise<string[]> {
  return withReadProvider((p) => p.callContract({ contractAddress: address, entrypoint, calldata }, "latest"));
}

function decodeByteArray(raw: string[]): string {
  const len = Number(BigInt(raw[0] ?? "0x0"));
  return byteArray.stringFromByteArray({
    data: raw.slice(1, 1 + len),
    pending_word: raw[1 + len] ?? "0x0",
    pending_word_len: Number(BigInt(raw[2 + len] ?? "0x0")),
  });
}

/** `data:application/json[;base64|;utf8],{...}` -> object. */
function parseDataUriJson(uri: string): Record<string, unknown> | null {
  const comma = uri.indexOf(",");
  if (comma === -1) return null;
  const header = uri.slice(0, comma);
  const body = uri.slice(comma + 1);
  try {
    return JSON.parse(header.includes("base64") ? atob(body) : body) as Record<string, unknown>;
  } catch {
    try {
      return JSON.parse(decodeURIComponent(body)) as Record<string, unknown>;
    } catch {
      return null;
    }
  }
}

export async function fetchFestivalSupply(c: FestivalCollection): Promise<number> {
  const raw = await call(c.address, "total_supply");
  return Number(BigInt(raw[0] ?? "0x0"));
}

export async function fetchFestivalMeta(c: FestivalCollection, tokenId: number): Promise<FestivalTokenMeta | null> {
  const json = parseDataUriJson(decodeByteArray(await call(c.address, "token_uri", u256(tokenId))));
  if (!json) return null;
  return {
    name: typeof json.name === "string" ? json.name : `${c.name} #${tokenId}`,
    description: typeof json.description === "string" ? json.description : null,
    image: typeof json.image === "string" ? json.image : "",
    animationUrl: typeof json.animation_url === "string" ? json.animation_url : null,
    attributes: Array.isArray(json.attributes) ? (json.attributes as FestivalAttribute[]) : [],
  };
}

export async function fetchFestivalOwner(c: FestivalCollection, tokenId: number): Promise<string | null> {
  try {
    return (await call(c.address, "owner_of", u256(tokenId)))[0] ?? null;
  } catch {
    return null;
  }
}

/** Extra ids probed past the expected range before giving up on missing tokens. */
const FESTIVAL_SCAN_SLACK = 50;

async function fetchFestivalToken(c: FestivalCollection, tokenId: number): Promise<FestivalToken> {
  const [meta, owner] = await Promise.all([
    fetchFestivalMeta(c, tokenId).catch(() => null),
    fetchFestivalOwner(c, tokenId),
  ]);
  return { tokenId, meta, owner };
}

/**
 * Every token with its metadata and owner (cached; supplies are tiny).
 *
 * The contracts aren't enumerable (no `token_by_index`), so ids are scanned
 * from 1. Ids that don't exist (burned) answer neither `owner_of` nor
 * `token_uri` and are skipped; scanning continues past `total_supply` until
 * that many live tokens are found or the slack runs out.
 */
export function fetchFestivalTokens(c: FestivalCollection): Promise<FestivalToken[]> {
  return apiCache.get("festival-tokens", { address: c.address }, async () => {
    const supply = await fetchFestivalSupply(c);
    const maxId = supply + FESTIVAL_SCAN_SLACK;
    const found: FestivalToken[] = [];
    let nextId = 1;
    while (found.length < supply && nextId <= maxId) {
      const batchSize = Math.min(supply - found.length, maxId - nextId + 1);
      const batch = await Promise.all(
        Array.from({ length: batchSize }, (_, i) => fetchFestivalToken(c, nextId + i)),
      );
      nextId += batchSize;
      found.push(...batch.filter((t) => t.owner !== null || t.meta !== null));
    }
    return found;
  });
}

/** Token ids of a collection held by `owner`. */
export function ownedFestivalTokenIds(tokens: FestivalToken[], owner: string | null | undefined): Set<number> {
  const target = normaliseStarknetAddress(owner);
  if (!target) return new Set();
  return new Set(tokens.filter((t) => normaliseStarknetAddress(t.owner) === target).map((t) => t.tokenId));
}

/** `"Prefix Suffix" Name` -> parts, as the on-chain names are formatted. */
export function splitFestivalName(name: string): { prefix: string | null; base: string } {
  const m = name.match(/^"([^"]+)"\s+(.+)$/);
  return m ? { prefix: m[1], base: m[2] } : { prefix: null, base: name };
}

/** Marketplace display record for a festival token. */
export function toFestivalListingToken(c: FestivalCollection, t: FestivalToken): FestivalListingToken {
  return {
    slug: c.slug,
    collectionName: c.name,
    tokenId: t.tokenId,
    name: t.meta?.name ?? `${c.name} #${t.tokenId}`,
    image: t.meta?.image ?? "",
  };
}

/**
 * Minimal Beast-shaped record for a festival token, for dialogs that take a
 * Beast (ListDialog, MakeOfferDialog). Festival tokens have no Beast record.
 */
export function festivalPlaceholderBeast(
  token: Pick<FestivalListingToken, "slug" | "tokenId" | "name" | "image">,
  owner: string | null,
): Beast {
  return {
    id: `${token.slug}:0x${token.tokenId.toString(16)}`,
    tokenId: String(token.tokenId),
    name: token.name,
    image: token.image,
    owner,
    attributes: [],
    metadata: { attributes: [] },
    power: null,
  };
}

import type { Beast as SdkBeast } from "@provable-games/collectables";
import { beastFullName, beastTraits, beastImageUrl } from "@provable-games/collectables";
import type { Beast, BeastAttribute, BeastMetadata } from "./types";

const COLLECTABLES_BASE_URL = "/collectables";

export function mapSdkBeast(sdkBeast: SdkBeast): Beast {
  const fullName = beastFullName(sdkBeast);
  const traits = beastTraits(sdkBeast);
  const imageUrl = beastImageUrl(sdkBeast, { baseUrl: COLLECTABLES_BASE_URL });
  const attributes: BeastAttribute[] = traits.map((t) => ({
    trait_type: t.trait_type,
    value: t.value,
  }));

  return {
    id: `beasts_nft:0x${sdkBeast.tokenId.toString(16)}`,
    numericId: sdkBeast.tokenId,
    name: fullName,
    image: imageUrl,
    owner: sdkBeast.owner ?? null,
    attributes,
    metadata: { name: fullName, image: imageUrl, attributes },
    power: sdkBeast.power,
  };
}

type AttributeLike = {
  trait_type?: unknown;
  traitType?: unknown;
  value?: unknown;
  trait_value?: unknown;
};

export type BeastRow = {
  id?: string | number;
  metadata?: unknown;
  account_address?: string | null;
  power?: unknown;
  total_count?: number;
} & Record<string, unknown>;

function normaliseAttributes(value: unknown): BeastAttribute[] {
  if (!Array.isArray(value)) return [];

  return (value as AttributeLike[])
    .map((entry) => {
      const traitType = entry?.trait_type ?? entry?.traitType ?? "";
      const rawValue = entry?.value ?? entry?.trait_value ?? "";

      return {
        trait_type: typeof traitType === "string" ? traitType : String(traitType ?? ""),
        value: typeof rawValue === "number" ? rawValue : String(rawValue ?? ""),
      } satisfies BeastAttribute;
    })
    .filter((attr) => Boolean(attr.trait_type));
}

function extractNumericCandidate(candidate: unknown): number | null {
  if (candidate == null) return null;

  if (typeof candidate === "number") {
    return Number.isFinite(candidate) ? candidate : null;
  }

  if (typeof candidate === "string") {
    const trimmed = candidate.trim();
    if (trimmed.length === 0) return null;

    if (/^\d+$/.test(trimmed)) {
      const parsed = Number.parseInt(trimmed, 10);
      return Number.isNaN(parsed) ? null : parsed;
    }

    const hashMatch = trimmed.match(/#(\d+)/);
    if (hashMatch?.[1]) {
      const parsed = Number.parseInt(hashMatch[1], 10);
      if (!Number.isNaN(parsed)) {
        return parsed;
      }
    }

    const digits = trimmed.match(/\d+/g);
    if (digits?.length) {
      const last = digits[digits.length - 1];
      const parsed = Number.parseInt(last, 10);
      if (!Number.isNaN(parsed)) {
        return parsed;
      }
    }
  }

  return null;
}

function deriveNumericId(
  row: BeastRow,
  metadata: BeastMetadata,
  attributes: BeastAttribute[],
): number {
  const metadataRecord = metadata as Record<string, unknown>;
  const attributeCandidates = attributes.map((attr) => {
    const trait = attr.trait_type?.toLowerCase?.() ?? "";
    if (["token id", "token_id", "tokenid", "beast id", "number", "id"].includes(trait)) {
      return attr.value;
    }
    return null;
  });

  const metadataCandidates: unknown[] = [
    metadataRecord?.token_id,
    metadataRecord?.tokenId,
    metadataRecord?.id,
    metadataRecord?.tokenID,
    metadata?.name,
  ];

  const candidates = [...attributeCandidates, ...metadataCandidates];

  for (const candidate of candidates) {
    const numeric = extractNumericCandidate(candidate);
    if (numeric != null) {
      return numeric;
    }
  }

  const rowId = row?.id;
  if (typeof rowId === "string") {
    const tail = rowId.includes(":")
      ? rowId.slice(rowId.lastIndexOf(":") + 1)
      : rowId;
    if (/^0x[0-9a-f]+$/i.test(tail)) {
      const parsed = Number.parseInt(tail, 16);
      if (!Number.isNaN(parsed)) {
        return parsed;
      }
    }

    const fromDigits = extractNumericCandidate(rowId);
    if (fromDigits != null) {
      return fromDigits;
    }
  }

  return 0;
}

export function parseMetadata(raw: unknown): BeastMetadata {
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      return {
        ...parsed,
        attributes: normaliseAttributes(parsed?.attributes),
      };
    } catch (error) {
      console.warn("⚠️ Failed to parse metadata JSON", error);
    }
  }

  if (typeof raw === "object" && raw !== null) {
    const record = raw as Record<string, unknown>;
    return {
      ...record,
      attributes: normaliseAttributes(record.attributes),
    };
  }

  return { attributes: [] };
}

export function derivePowerFromAttributes(attributes: BeastAttribute[]): number | null {
  const powerAttribute = attributes.find((attr) => {
    const trait = (attr.trait_type ?? "").toLowerCase();
    return trait === "power" || trait.includes("power");
  });

  if (!powerAttribute) {
    return null;
  }

  const { value } = powerAttribute;

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value === "string") {
    const numeric = Number.parseFloat(value.replace(/[^0-9.+-]/g, ""));
    return Number.isNaN(numeric) ? null : numeric;
  }

  return null;
}

export function coercePower(raw: unknown, attributes: BeastAttribute[]): number | null {
  if (raw != null) {
    if (typeof raw === "number") {
      return Number.isFinite(raw) ? raw : null;
    }

    if (typeof raw === "string" && raw.trim().length > 0) {
      const parsed = Number.parseFloat(raw.replace(/[^0-9.+-]/g, ""));
      if (!Number.isNaN(parsed)) {
        return parsed;
      }
    }
  }

  return derivePowerFromAttributes(attributes);
}

export function mapBeastRow(row: BeastRow): Beast {
  const metadata = parseMetadata(row?.metadata);
  const attributes = metadata?.attributes ?? [];
  const numericId = deriveNumericId(row, metadata, attributes);

  // Use metadata name if available, otherwise use a clean fallback with numeric ID
  const name = metadata?.name && metadata.name.trim().length > 0
    ? metadata.name
    : `Beast #${numericId || "Unknown"}`;

  return {
    id: String(row?.id ?? ""),
    numericId,
    name,
    image: metadata?.image ?? "",
    owner: row?.account_address ?? null,
    attributes,
    metadata,
    power: coercePower(row?.power, attributes),
  };
}

/**
 * Check if a beast has complete metadata (name, image, attributes)
 */
export function hasCompleteMetadata(beast: Beast): boolean {
  // Must have a proper name (not just the fallback)
  if (!beast.name || beast.name.startsWith("Beast #")) {
    return false;
  }

  // Must have an image
  if (!beast.image || beast.image.trim().length === 0) {
    return false;
  }

  // Must have at least some attributes
  if (!beast.attributes || beast.attributes.length === 0) {
    return false;
  }

  return true;
}

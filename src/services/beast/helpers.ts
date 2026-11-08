import type { Beast as SdkBeast } from "@provable-games/collectables";
import {
  beastFullName,
  beastTraits,
  beastV3Traits,
  beastImageUrl,
  hasBundledBeastImage,
  isV3Beast,
  normalizeTokenId,
} from "@provable-games/collectables";
import type { Beast, BeastAttribute, BeastVisual } from "./types";
import { spriteSpeciesName } from "./cardImage";

const COLLECTABLES_BASE_URL = "/collectables";

const VISUALS: BeastVisual[] = ["Regular", "Shiny", "MIDI", "Shiny MIDI"];

/** Visual preset label → v3 `visualEffects` value. */
export const VISUAL_TO_EFFECTS: Record<BeastVisual, number> = {
  Regular: 0,
  Shiny: 1,
  MIDI: 2,
  "Shiny MIDI": 3,
};

/**
 * Shiny / animated / visual label for a beast. v3 encodes these in
 * `visualEffects` (0 regular, 1 shiny, 2 MIDI, 3 shiny MIDI — labels per the v3 announcement: every original is animated now, and presets 2/3 add the MIDI notes effect; `animated` below keeps the legacy V2 name); the SDK's
 * `animated` flag is always true on v3, so it must not be used there.
 */
export function beastVisual(sdkBeast: Pick<SdkBeast, "shiny" | "animated" | "visualEffects">): {
  shiny: boolean;
  animated: boolean;
  visual: BeastVisual;
} {
  if (typeof sdkBeast.visualEffects === "number") {
    const ve = sdkBeast.visualEffects;
    const shiny = ve === 1 || ve === 3;
    const animated = ve === 2 || ve === 3;
    return { shiny, animated, visual: VISUALS[ve] ?? "Regular" };
  }
  const shiny = Boolean(sdkBeast.shiny);
  const animated = Boolean(sdkBeast.animated);
  return { shiny, animated, visual: VISUALS[(shiny ? 1 : 0) + (animated ? 2 : 0)] };
}

export function mapSdkBeast(sdkBeast: SdkBeast): Beast {
  const tokenId = normalizeTokenId(sdkBeast.tokenId);
  const fullName = beastFullName(sdkBeast);
  const v3 = isV3Beast(sdkBeast);
  const { shiny, animated, visual } = beastVisual(sdkBeast);

  const traits = v3 ? beastV3Traits(sdkBeast) : beastTraits(sdkBeast);
  const attributes: BeastAttribute[] = traits.map((t) => ({
    trait_type: t.trait_type,
    value: t.value,
  }));
  if (v3) {
    // v3 token_uri has no Shiny/Animated traits (they live in visualEffects).
    // Derive them in the legacy "1"/"0" format so attribute readers keep working.
    attributes.push(
      { trait_type: "Shiny", value: shiny ? "1" : "0" },
      { trait_type: "Animated", value: animated ? "1" : "0" },
      { trait_type: "Visual", value: visual },
    );
  }

  // Image selection keys off the legacy-style shiny/animated flags.
  // v3 renamed two species (Asag, Metsavana) whose sprites keep legacy names.
  const imageInput = {
    name: v3 ? spriteSpeciesName(sdkBeast.name) : sdkBeast.name,
    shiny,
    animated: v3 ? true : animated,
  };
  const hasBundledImage = hasBundledBeastImage(imageInput);
  // No bundled sprite (v3 species past the bundled set): leave image empty so
  // the card falls back to the on-chain token_uri image.
  const imageUrl = hasBundledImage
    ? beastImageUrl(imageInput, { baseUrl: COLLECTABLES_BASE_URL })
    : "";

  return {
    id: `beasts_nft:0x${BigInt(tokenId).toString(16)}`,
    tokenId,
    name: fullName,
    image: imageUrl,
    owner: sdkBeast.owner ?? null,
    attributes,
    metadata: { name: fullName, image: imageUrl, attributes },
    power: sdkBeast.power,
    speciesId: sdkBeast.beastId,
    shiny,
    animated,
    visual,
    visualEffects: sdkBeast.visualEffects,
    cardGrade: sdkBeast.cardGrade,
    soulbound: sdkBeast.soulbound,
    transferLockedUntil: sdkBeast.transferLockedUntil,
    genesis: sdkBeast.genesis,
    mega: sdkBeast.mega,
    minterData: sdkBeast.minterData,
    midi: sdkBeast.midi,
    hasBundledImage,
  };
}

/**
 * Check if a beast has complete metadata (name, attributes). An image is not
 * required: v3 species without a bundled sprite render from chain.
 */
export function hasCompleteMetadata(beast: Beast): boolean {
  if (!beast.name || beast.name.startsWith("Beast #")) return false;
  if (!beast.image && beast.hasBundledImage !== false) return false;
  if (!beast.attributes || beast.attributes.length === 0) return false;
  return true;
}

/** "12.3% of beasts": how rare one visual preset is among `total` beasts. */
export function presetShareLabel(count: number, total: number): string {
  if (!(total > 0) || !(count > 0)) return "None collected yet";
  const pct = (count / total) * 100;
  return `${pct < 1 ? pct.toFixed(2) : pct.toFixed(1)}% of beasts`;
}

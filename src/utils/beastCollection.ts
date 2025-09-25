import type { Beast } from "../services/beast";

export const TOTAL_BEAST_VARIETIES = 75;

export type BeastCollectionStats = {
  animatedShinyCount: number;
  animatedCount: number;
  shinyCount: number;
  standardCount: number;
  mostPowerful: Beast | null;
  mostPowerfulTitle: string | null;
  rarest: Beast | null;
  highestRanked: Beast | null;
  lastBeastKilled: Beast | null;
  lastBeastKilledName: string | null;
  uniqueBeastTypes: number;
  uniqueAnimatedShinyTypes: number;
  uniqueAnimatedTypes: number;
  uniqueShinyTypes: number;
  uniqueStandardTypes: number;
};

const DEFAULT_STATS: BeastCollectionStats = {
  animatedShinyCount: 0,
  animatedCount: 0,
  shinyCount: 0,
  standardCount: 0,
  mostPowerful: null,
  mostPowerfulTitle: null,
  rarest: null,
  highestRanked: null,
  lastBeastKilled: null,
  lastBeastKilledName: null,
  uniqueBeastTypes: 0,
  uniqueAnimatedShinyTypes: 0,
  uniqueAnimatedTypes: 0,
  uniqueShinyTypes: 0,
  uniqueStandardTypes: 0,
};

function extractBeastRankValue(beast: Beast): number | null {
  let best: number | null = null;

  beast.attributes.forEach((attr) => {
    const trait = attr.trait_type?.toLowerCase?.() ?? "";
    if (!trait.includes("rank")) {
      return;
    }

    let value: number | null = null;
    if (typeof attr.value === "number") {
      value = Number.isFinite(attr.value) ? attr.value : null;
    } else if (typeof attr.value === "string") {
      const match = attr.value.match(/\d+(?:\.\d+)?/);
      if (match) {
        const numeric = Number.parseFloat(match[0]);
        value = Number.isNaN(numeric) ? null : numeric;
      }
    }

    if (value == null || value <= 0) {
      return;
    }

    if (best == null || value < best) {
      best = value;
    }
  });

  return best;
}

function parseTimestamp(value: unknown): number | null {
  if (value == null) {
    return null;
  }

  const normalise = (numeric: number): number | null => {
    if (!Number.isFinite(numeric)) return null;

    let ms = numeric;
    if (ms > 1e14 && ms < 1e18) {
      while (ms > 1e13) {
        ms /= 10;
      }
    }

    if (ms < 1e10) {
      ms *= 1000;
    }

    return ms;
  };

  if (typeof value === "number") {
    return normalise(value);
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed.length === 0) return null;

    const asNumber = Number(trimmed);
    if (!Number.isNaN(asNumber)) {
      return normalise(asNumber);
    }

    const isoCandidate = trimmed.includes("T") ? trimmed : trimmed.replace(" ", "T");
    const parsedIso = Date.parse(isoCandidate);
    if (!Number.isNaN(parsedIso)) {
      return parsedIso;
    }

    const digits = trimmed.match(/\d+(?:\.\d+)?/);
    if (digits?.[0]) {
      const numeric = Number.parseFloat(digits[0]);
      return normalise(numeric);
    }
  }

  return null;
}

export function computeBeastCollectionStats(beasts: Beast[]): BeastCollectionStats {
  if (!Array.isArray(beasts) || beasts.length === 0) {
    return DEFAULT_STATS;
  }

  let animatedShiny = 0;
  let animatedOnly = 0;
  let shinyOnly = 0;
  let standard = 0;
  let mostPowerful: Beast | null = null;
  let rarest: Beast | null = null;
  let highestRanked: Beast | null = null;
  let mostPowerfulTitle: string | null = null;
  let lastKilled: Beast | null = null;
  let lastKilledName: string | null = null;
  let lastDeathTimestamp = -Infinity;
  let bestRarityScore = -1;
  let bestRankValue = Number.POSITIVE_INFINITY;
  let lowestNumericId: Beast | null = null;
  const allTypes = new Set<string>();
  const animatedShinyTypes = new Set<string>();
  const animatedTypes = new Set<string>();
  const shinyTypes = new Set<string>();
  const standardTypes = new Set<string>();

  beasts.forEach((beast) => {
    const typeAttribute = beast.attributes.find(
      (attr) => attr.trait_type?.toLowerCase() === "beast"
    )?.value;
    const beastTypeKey = typeAttribute ? String(typeAttribute).trim().toLowerCase() : "";
    if (beastTypeKey) {
      allTypes.add(beastTypeKey);
    }

    const shiny = beast.attributes.some(
      (attr) => attr.trait_type?.toLowerCase() === "shiny" && attr.value === "1",
    );
    const animated = beast.attributes.some(
      (attr) => attr.trait_type?.toLowerCase() === "animated" && attr.value === "1",
    );

    if (shiny && animated) {
      animatedShiny += 1;
      if (bestRarityScore < 3) {
        rarest = beast;
        bestRarityScore = 3;
      }
      if (beastTypeKey) {
        animatedShinyTypes.add(beastTypeKey);
      }
    } else if (animated) {
      animatedOnly += 1;
      if (bestRarityScore < 2) {
        rarest = beast;
        bestRarityScore = 2;
      }
      if (beastTypeKey) {
        animatedTypes.add(beastTypeKey);
      }
    } else if (shiny) {
      shinyOnly += 1;
      if (bestRarityScore < 2) {
        rarest = beast;
        bestRarityScore = 2;
      }
      if (beastTypeKey) {
        shinyTypes.add(beastTypeKey);
      }
    } else {
      standard += 1;
      if (bestRarityScore < 1) {
        rarest = beast;
        bestRarityScore = 1;
      }
      if (beastTypeKey) {
        standardTypes.add(beastTypeKey);
      }
    }

    if (!mostPowerful || (beast.power ?? 0) > (mostPowerful.power ?? 0)) {
      mostPowerful = beast;
      const trimmedName = beast.name?.trim() ?? "";
      const quotedMatch = trimmedName.match(/"([^"]+)"/);
      if (quotedMatch?.[1]) {
        mostPowerfulTitle = quotedMatch[1];
      } else {
        const parts = trimmedName.split(/\s+/).filter(Boolean);
        if (parts.length >= 2) {
          mostPowerfulTitle = `${parts[0]} ${parts[1]}`;
        } else if (parts.length === 1) {
          mostPowerfulTitle = parts[0];
        } else {
          mostPowerfulTitle = null;
        }
      }
    }

    if (Number.isFinite(beast.numericId)) {
      if (
        !lowestNumericId ||
        (beast.numericId ?? Number.POSITIVE_INFINITY) < (lowestNumericId.numericId ?? Number.POSITIVE_INFINITY)
      ) {
        lowestNumericId = beast;
      }
    }

    const rankValue = extractBeastRankValue(beast);
    if (rankValue != null && rankValue < bestRankValue) {
      bestRankValue = rankValue;
      highestRanked = beast;
    }

    const deathTimestampAttr = beast.attributes.find(
      (attr) => attr.trait_type?.toLowerCase() === "last death timestamp"
    )?.value;
    const timestamp = parseTimestamp(deathTimestampAttr);
    if (timestamp != null && timestamp > lastDeathTimestamp) {
      lastDeathTimestamp = timestamp;
      lastKilled = beast;
      const deathNameAttr = beast.attributes.find((attr) => {
        const trait = attr.trait_type?.toLowerCase() ?? "";
        return trait.includes("last death") &&
          (trait.includes("beast") || trait.includes("name") || trait.includes("killed"));
      })?.value;
      lastKilledName = deathNameAttr != null ? String(deathNameAttr) : beast.name;
    }
  });

  return {
    animatedShinyCount: animatedShiny,
    animatedCount: animatedOnly,
    shinyCount: shinyOnly,
    standardCount: standard,
    mostPowerful,
    mostPowerfulTitle,
    rarest,
    highestRanked: highestRanked ?? lowestNumericId,
    lastBeastKilled: lastKilled,
    lastBeastKilledName: lastKilledName,
    uniqueBeastTypes: allTypes.size,
    uniqueAnimatedShinyTypes: animatedShinyTypes.size,
    uniqueAnimatedTypes: animatedTypes.size,
    uniqueShinyTypes: shinyTypes.size,
    uniqueStandardTypes: standardTypes.size,
  };
}

export function calculateTotalPower(beasts: Beast[]): number {
  if (!Array.isArray(beasts) || beasts.length === 0) {
    return 0;
  }

  return beasts.reduce((sum, beast) => {
    const power = typeof beast.power === "number" && Number.isFinite(beast.power)
      ? beast.power
      : 0;
    return sum + power;
  }, 0);
}

export function calculateKdRatio(total: number, deaths: number): string {
  if (total <= 0 && deaths <= 0) return "0.00";
  if (deaths <= 0) return "∞";
  return (total / deaths).toFixed(2);
}

export { DEFAULT_STATS as EMPTY_BEAST_COLLECTION_STATS };

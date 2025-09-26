// Static beast templates for placeholder images in collection view
// This eliminates the need to fetch random beasts just for images

export const BEAST_TEMPLATES: Record<string, {
  name: string;
  image?: string;
  placeholderImage: string; // Fallback image URL or base64
}> = {
  // Add beast templates here - these can be pre-generated or manually curated
  // For now, using placeholder structure that can be populated
  "warlock": {
    name: "Warlock",
    placeholderImage: "/images/beasts/warlock.png"
  },
  "typhon": {
    name: "Typhon", 
    placeholderImage: "/images/beasts/typhon.png"
  },
  "jiangshi": {
    name: "Jiangshi",
    placeholderImage: "/images/beasts/jiangshi.png"
  },
  "anansi": {
    name: "Anansi",
    placeholderImage: "/images/beasts/anansi.png"
  },
  "basilisk": {
    name: "Basilisk",
    placeholderImage: "/images/beasts/basilisk.png"
  },
  // Add more beast templates as needed...
  // This can be populated from the beastTypes that are already being fetched
};

// Fallback image for unknown beast types
export const FALLBACK_BEAST_IMAGE = "/images/beasts/unknown.png";

export function getBeastTemplate(beastType: string) {
  const normalized = beastType.toLowerCase().trim();
  return BEAST_TEMPLATES[normalized] || {
    name: beastType,
    placeholderImage: FALLBACK_BEAST_IMAGE
  };
}
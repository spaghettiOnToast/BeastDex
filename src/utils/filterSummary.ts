import type { BeastAttributeFilters } from "../services/beast";

const BOOLEAN_TRAITS = new Set(["festival", "shiny", "animated", "soulbound", "genesis", "mega", "midi"]);

/**
 * Short labels for active beast filters, e.g. ["Shiny MIDI", "Grade 10", "Genesis: No"].
 * Empty filters are skipped.
 */
export function describeAttributeFilters(filters: BeastAttributeFilters, search?: string | null): string[] {
  const labels: string[] = [];
  const q = search?.trim();
  if (q) labels.push(`“${q}”`);
  for (const [trait, raw] of Object.entries(filters ?? {})) {
    const values = (raw ?? []).map(String).filter((v) => v !== "");
    if (values.length === 0) continue;
    const key = trait.toLowerCase();
    if (key === "card grade") {
      const lo = values[0];
      const hi = values[1] ?? "10";
      labels.push(lo === hi ? `Grade ${lo}` : `Grade ${lo}–${hi}`);
    } else if (BOOLEAN_TRAITS.has(key)) {
      const yes = values.some((v) => v === "1" || v === "true");
      labels.push(`${trait}${yes ? "" : ": No"}`);
    } else if (key === "visual" || key === "beast" || key === "type" || key === "prefix" || key === "suffix") {
      labels.push(values.length <= 2 ? values.join(" / ") : `${values.length} ${trait.toLowerCase()}s`);
    } else if (key === "tier") {
      labels.push(values.length === 1 ? `Tier ${values[0]}` : `Tiers ${values.join(", ")}`);
    } else if (values.length === 2 && /^\d+$/.test(values[0]) && /^\d+$/.test(values[1])) {
      labels.push(`${trait} ${values[0]}–${values[1]}`);
    } else {
      labels.push(`${trait}: ${values.join(", ")}`);
    }
  }
  return labels;
}

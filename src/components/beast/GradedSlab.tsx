import type { ReactNode } from "react";
import { beastV3Catalog } from "@provable-games/collectables";
import type { Beast } from "../../services/beast";
import { getAttributeValue } from "../../utils/beast";

/** Grading-scale descriptors (the standard trading-card grading scale). */
const GRADE_DESCRIPTORS: Record<number, string> = {
  10: "GEM MT",
  9: "MINT",
  8: "NM-MT",
  7: "NM",
};

/** Gold rim for Shiny MIDI, from the card's `gold` gradient (#e5d8b2 → #b79a5e → #8a6d3b). */
const GOLD_STOPS = "#e5d8b2, #b79a5e, #8a6d3b, #f3e7c4, #b79a5e, #8a6d3b, #e5d8b2";

/**
 * Small BeastDex mark for the label: the header logo (components/common/Logo)
 * with flat colours, so no gradient ids clash when many slabs share a page.
 */
function BeastDexMark() {
  return (
    <svg viewBox="0 0 220 160" aria-hidden style={{ height: "3.6cqw", width: "auto", display: "block" }}>
      <path d="M32 76 L12 52 C8 47 11 40 18 40h32" fill="none" stroke="#1fae0b" strokeWidth="10" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M188 76 L208 52 C212 47 209 40 202 40h-32" fill="none" stroke="#1fae0b" strokeWidth="10" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="28" y="32" width="164" height="96" rx="32" fill="#0b1120" stroke="#1fae0b" strokeWidth="6" />
      <circle cx="110" cy="80" r="30" fill="#062a12" stroke="#39ff14" strokeWidth="5" />
      <circle cx="110" cy="80" r="13" fill="#39ff14" />
      <circle cx="72" cy="56" r="8" fill="#2ce0ff" />
      <circle cx="148" cy="56" r="8" fill="#2ce0ff" />
    </svg>
  );
}

/** Short certification number: the last 8 digits of the token id. */
function certNumber(tokenId: string): string {
  return tokenId.slice(-8).padStart(8, "0");
}

type Props = {
  beast: Beast;
  /** The card face (art + overlays), rendered inside the slab's well. */
  children: ReactNode;
};

/**
 * A graded-card slab around high-grade (7+) v3 beasts: a clear case with a
 * label carrying the grade, its descriptor, the species catalog, the card's
 * name/variant and a certification number. All sizes are in container units
 * (the outer wrapper is the size container) so the slab scales with its width.
 * Grade 10 Shiny MIDI beasts get a rotating gold rim.
 */
export default function GradedSlab({ beast, children }: Props) {
  const speciesName = getAttributeValue(beast, "Beast") ?? beast.name;
  const prefixName = getAttributeValue(beast, "Prefix");
  const suffixName = getAttributeValue(beast, "Suffix");
  const tier = getAttributeValue(beast, "Tier") ?? "?";
  const level = getAttributeValue(beast, "Level") ?? "?";
  const grade = beast.cardGrade ?? 0;
  const gem = grade === 10;
  const catalog = beast.speciesId ? beastV3Catalog(beast.speciesId) : "Original";
  const nickname = prefixName && suffixName ? `"${prefixName} ${suffixName}" ` : "";
  const variant = [
    beast.genesis ? "Genesis" : null,
    beast.mega ? "Mega" : null,
    beast.visual && beast.visual !== "Regular" ? beast.visual : null,
  ].filter(Boolean).join(" · ") || "Regular";

  const frame = gem ? "#b08a2e" : "#9f1d24";
  const labelBg = gem
    ? "linear-gradient(135deg, #f7e7a8 0%, #e2c063 45%, #f5e3a0 70%, #c9a246 100%)"
    : "linear-gradient(180deg, #fbfaf6 0%, #efece4 100%)";
  const ink = gem ? "#2b1d00" : "#16161a";
  const accent = gem ? "#5c3d00" : "#9f1d24";
  // Grade 10 Shiny MIDI gets a rotating gold rim; every other slab a clear edge.
  const goldRim = gem && beast.visual === "Shiny MIDI";

  return (
    <div style={{ width: "100%", containerType: "inline-size" }}>
    <div
      title={`Graded ${grade} ${GRADE_DESCRIPTORS[grade] ?? ""} · ${catalog} catalog`}
      style={{
        position: "relative", width: "100%", aspectRatio: "250 / 350", lineHeight: 1,
        display: "grid", gridTemplateRows: "auto minmax(0, 1fr)", gap: "2.4cqw",
        padding: "3.2cqw", boxSizing: "border-box", borderRadius: "4.5cqw",
        // Clear acrylic case.
        background: "linear-gradient(160deg, rgba(255,255,255,0.22) 0%, rgba(210,220,235,0.10) 40%, rgba(255,255,255,0.16) 100%)",
        border: goldRim ? "none" : "1px solid rgba(255,255,255,0.35)",
        boxShadow: "inset 0 0 0 1.2cqw rgba(255,255,255,0.06), inset 0 1px 0 rgba(255,255,255,0.5), 0 2px 10px rgba(0,0,0,0.55)",
        backdropFilter: "blur(2px)",
      }}
    >
      {goldRim && (
        <div aria-hidden style={{
          position: "absolute", inset: 0, borderRadius: "inherit", padding: "1.4cqw",
          overflow: "hidden", pointerEvents: "none",
          // Show only the padding ring: the content box is masked out.
          WebkitMask: "linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)",
          WebkitMaskComposite: "xor",
          mask: "linear-gradient(#000 0 0) content-box exclude, linear-gradient(#000 0 0)",
        }}>
          <div className="animate-spin" style={{
            position: "absolute", width: "180cqw", height: "180cqw",
            left: "calc(50% - 90cqw)", top: "calc(50% - 90cqw)", animationDuration: "6s",
            background: `conic-gradient(${GOLD_STOPS})`,
          }} />
        </div>
      )}
      {/* Label */}
      <div
        style={{
          background: labelBg, color: ink, borderRadius: "1.6cqw",
          border: `0.9cqw solid ${frame}`, padding: "1.6cqw 2.4cqw",
          display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", columnGap: "2cqw",
          fontFamily: "ui-sans-serif, system-ui, -apple-system, 'Helvetica Neue', Arial, sans-serif",
          boxShadow: "0 1px 2px rgba(0,0,0,0.35)",
        }}
      >
        <div style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: "0.9cqw" }}>
          <div style={{ fontSize: "3.6cqw", fontWeight: 800, letterSpacing: "0.25cqw", color: accent, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            BEASTS V3 · {catalog.toUpperCase()}
          </div>
          <div style={{ fontSize: "4.6cqw", fontWeight: 800, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", textTransform: "uppercase" }}>
            {nickname}{speciesName}
          </div>
          <div style={{ fontSize: "3.4cqw", fontWeight: 600, opacity: 0.8, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", textTransform: "uppercase" }}>
            {variant} · T{tier} · LV {level}
          </div>
          <div style={{ fontSize: "3cqw", fontWeight: 700, fontVariantNumeric: "tabular-nums", letterSpacing: "0.2cqw", whiteSpace: "nowrap", marginTop: "0.4cqw", opacity: 0.85 }}>
            CERT #{certNumber(beast.tokenId)}
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", justifyContent: "space-between" }}>
          <div style={{ fontSize: "3.6cqw", fontWeight: 800, letterSpacing: "0.25cqw", color: accent, whiteSpace: "nowrap" }}>
            {GRADE_DESCRIPTORS[grade] ?? `GRADE`}
          </div>
          <div style={{ fontSize: "13cqw", fontWeight: 900, lineHeight: 0.9, letterSpacing: "-0.4cqw" }}>{grade}</div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.8cqw" }}>
            <BeastDexMark />
            <span style={{ fontSize: "2.6cqw", fontWeight: 800, letterSpacing: "0.3cqw", opacity: 0.7 }}>BEASTDEX</span>
          </div>
        </div>
      </div>

      {/* Card well */}
      <div style={{ minHeight: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{
          position: "relative", height: "100%", maxWidth: "100%", aspectRatio: "250 / 350",
          borderRadius: "2.4cqw", overflow: "hidden", background: "#1b1b1f", lineHeight: 0,
          boxShadow: "0 0 0 0.6cqw rgba(0,0,0,0.35), 0 1px 6px rgba(0,0,0,0.5)",
        }}>
          {children}
        </div>
      </div>

      {/* Acrylic sheen over the whole case */}
      <div aria-hidden style={{
        position: "absolute", inset: 0, borderRadius: "inherit", pointerEvents: "none", zIndex: 25,
        background: "linear-gradient(115deg, rgba(255,255,255,0) 30%, rgba(255,255,255,0.13) 42%, rgba(255,255,255,0) 52%)",
      }} />
    </div>
    </div>
  );
}

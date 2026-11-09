import type { ReactNode } from "react";
import { beastV3Catalog } from "@provable-games/collectables";
import type { Beast } from "../../services/beast";

/** Grading-scale descriptors (the standard trading-card grading scale). */
const GRADE_DESCRIPTORS: Record<number, string> = {
  10: "GEM MT",
  9: "MINT",
  8: "NM-MT",
  7: "NM",
};

/** Short certification number: the last 8 digits of the token id. */
function certNumber(tokenId: string): string {
  return tokenId.slice(-8).padStart(8, "0");
}

/** Decorative barcode whose bar widths come from the token id's digits. */
function Barcode({ tokenId, color }: { tokenId: string; color: string }) {
  const digits = tokenId.slice(-24).split("").map((d) => Number(d) || 0);
  return (
    <div aria-hidden style={{ display: "flex", alignItems: "stretch", height: "100%", gap: "0.45cqw" }}>
      {digits.map((d, i) => (
        <span key={i} style={{ width: `${0.35 + (d % 3) * 0.35}cqw`, background: color }} />
      ))}
    </div>
  );
}

type Props = {
  beast: Beast;
  speciesName: string;
  prefixName: string | null;
  suffixName: string | null;
  tier: number;
  level: number;
  /** The card face (art + overlays), rendered inside the slab's well. */
  children: ReactNode;
};

/**
 * A graded-card slab around high-grade (7+) v3 beasts: a clear case with a
 * label carrying the grade, its descriptor, the species catalog, the card's
 * name/variant and a certification number. All sizes are in container units
 * so the slab scales with the card (BeastCard's root is an @container).
 */
export default function GradedSlab({ beast, speciesName, prefixName, suffixName, tier, level, children }: Props) {
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

  return (
    <div
      title={`Graded ${grade} ${GRADE_DESCRIPTORS[grade] ?? ""} · ${catalog} catalog`}
      style={{
        position: "relative", width: "100%", aspectRatio: "250 / 350", lineHeight: 1,
        display: "grid", gridTemplateRows: "auto minmax(0, 1fr)", gap: "2.4cqw",
        padding: "3.2cqw", boxSizing: "border-box", borderRadius: "4.5cqw",
        // Clear acrylic case.
        background: "linear-gradient(160deg, rgba(255,255,255,0.22) 0%, rgba(210,220,235,0.10) 40%, rgba(255,255,255,0.16) 100%)",
        border: "1px solid rgba(255,255,255,0.35)",
        boxShadow: "inset 0 0 0 1.2cqw rgba(255,255,255,0.06), inset 0 1px 0 rgba(255,255,255,0.5), 0 2px 10px rgba(0,0,0,0.55)",
        backdropFilter: "blur(2px)",
      }}
    >
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
          <div style={{ display: "flex", alignItems: "center", gap: "1.6cqw", height: "3.6cqw", marginTop: "0.4cqw" }}>
            <Barcode tokenId={beast.tokenId} color={ink} />
            <span style={{ fontSize: "3cqw", fontWeight: 700, fontVariantNumeric: "tabular-nums", letterSpacing: "0.2cqw", whiteSpace: "nowrap" }}>
              {certNumber(beast.tokenId)}
            </span>
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", justifyContent: "space-between" }}>
          <div style={{ fontSize: "3.6cqw", fontWeight: 800, letterSpacing: "0.25cqw", color: accent, whiteSpace: "nowrap" }}>
            {GRADE_DESCRIPTORS[grade] ?? `GRADE`}
          </div>
          <div style={{ fontSize: "13cqw", fontWeight: 900, lineHeight: 0.9, letterSpacing: "-0.4cqw" }}>{grade}</div>
          <div style={{ fontSize: "2.6cqw", fontWeight: 800, letterSpacing: "0.3cqw", opacity: 0.7 }}>BEASTDEX</div>
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
  );
}

import { memo, useMemo } from "react";
import { Link } from "react-router-dom";
import { renderBeastCardSvg, type BeastCardInput } from "@provable-games/collectables";
import type { Beast, BeastAttribute } from "../../services/beast";

type Props = {
  beast: Beast;
  owned?: boolean;
  ownerUsername?: string | null;
  onSelect?: (beast: Beast) => void;
  missing?: boolean;
  overlayLabel?: string;
  disabled?: boolean;
  duplicateCount?: number;
  /** Highlights the card when every named variant of this species/affix has been collected */
  hasAllVariants?: boolean;
  className?: string;
};

function getAttr(attributes: BeastAttribute[], trait: string): string | number | null {
  const found = attributes.find((a) => a.trait_type.toLowerCase() === trait.toLowerCase());
  return found?.value ?? null;
}

function isTruthy(v: string | number | null): boolean {
  return v === "true" || v === "1" || v === 1;
}

function toNumber(v: string | number | null): number {
  if (typeof v === "number") return v;
  const n = parseInt(String(v ?? ""), 10);
  return Number.isFinite(n) ? n : 0;
}

const BEAST_TYPES = new Set(["Magic", "Hunter", "Brute"]);

const BeastCard = memo(function BeastCard({
  beast,
  owned,
  ownerUsername,
  onSelect,
  missing = false,
  overlayLabel = "Need to hunt",
  disabled = false,
  duplicateCount,
  hasAllVariants = false,
  className,
}: Props) {
  const { image, owner, attributes, power } = beast;

  const cardInput: BeastCardInput = useMemo(() => {
    const speciesName = getAttr(attributes, "Beast");
    const prefixName = getAttr(attributes, "Prefix");
    const suffixName = getAttr(attributes, "Suffix");
    const type = String(getAttr(attributes, "Type") ?? "");
    return {
      name: String(speciesName ?? beast.name),
      type: BEAST_TYPES.has(type) ? (type as BeastCardInput["type"]) : "Hunter",
      tier: toNumber(getAttr(attributes, "Tier")),
      prefixName: prefixName != null ? String(prefixName) : null,
      suffixName: suffixName != null ? String(suffixName) : null,
      level: toNumber(getAttr(attributes, "Level")),
      health: toNumber(getAttr(attributes, "Health")),
      power: power ?? 0,
      rank: toNumber(getAttr(attributes, "Rank")),
      shiny: isTruthy(getAttr(attributes, "Shiny")),
    };
  }, [attributes, beast.name, power]);

  // Render the canonical on-chain card SVG (same generator as the token_uri) with
  // our hosted sprite as the art — no more hand-built DOM/CSS card layout.
  //
  // `art` gets embedded as a plain <image href> inside the SVG. Rendering that SVG
  // via `<img src="data:image/svg+xml,...">` puts it in a sandboxed "image context"
  // with an opaque origin, where the browser blocks the <image>'s external fetch
  // regardless of the URL — so instead inline the SVG markup directly into the
  // page's own DOM (real origin, no restriction), and let it size off its viewBox.
  const cardSvgMarkup = useMemo(
    () => renderBeastCardSvg(cardInput, { art: image || undefined })
      .replace("width='250' height='350'", "width='100%' height='100%'"),
    [cardInput, image]
  );

  const renderOwner = () => {
    if (missing || !owned || !owner) return null;
    const address = owner.toLowerCase();
    const isRealUsername = ownerUsername && !ownerUsername.match(/^0x[a-fA-F0-9]{4}\.{3}[a-fA-F0-9]{4}$/);
    const label = isRealUsername ? ownerUsername : `${owner.slice(0, 6)}…${owner.slice(-4)}`;
    const identifier = isRealUsername ? ownerUsername.trim().toLowerCase() : address;
    return (
      <div className="flex items-center justify-center mt-1 text-[10px] text-white/70 gap-1">
        <span>Owned by</span>
        <Link
          to={`/collection/${encodeURIComponent(identifier)}`}
          className="text-white font-medium truncate hover:underline transition-colors"
          onClick={(e) => e.stopPropagation()}
        >
          {label}
        </Link>
      </div>
    );
  };

  return (
    <div
      style={{ cursor: disabled || missing ? "default" : "pointer", opacity: missing || disabled ? 0.5 : 1, position: "relative" }}
      onClick={() => { if (!disabled && !missing) onSelect?.(beast); }}
      className={`transition-transform duration-150 hover:scale-[1.03] w-full${className ? ` ${className}` : ""}`}
    >
      {(duplicateCount ?? 0) > 1 && !missing && (
        <div style={{
          position: "absolute", top: -6, right: -6, zIndex: 30,
          background: "#c4a44a", color: "#000", borderRadius: "50%",
          width: 18, height: 18, display: "flex", alignItems: "center",
          justifyContent: "center", fontSize: 10, fontWeight: "bold",
          boxShadow: "0 1px 4px rgba(0,0,0,0.5)",
        }}>{duplicateCount}</div>
      )}
      <div style={{
        position: "relative", width: "100%", aspectRatio: "250 / 350", lineHeight: 0,
        borderRadius: 10, overflow: "hidden",
        boxShadow: hasAllVariants && !missing ? "0 0 0 2px #39ff14" : undefined,
      }}>
        <div
          style={{ width: "100%", height: "100%" }}
          role="img"
          aria-label={String(getAttr(attributes, "Beast") ?? beast.name)}
          // renderBeastCardSvg's output is our own trusted, deterministically-generated
          // markup (no user input) — inlined directly so its <image href> resolves
          // against the page's real origin instead of a sandboxed data: URI.
          dangerouslySetInnerHTML={{ __html: cardSvgMarkup }}
        />
        {missing && (
          <div style={{
            position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center",
            background: "rgba(0,0,0,0.55)", backdropFilter: "blur(4px)",
          }}>
            <span style={{
              fontSize: 9, textTransform: "uppercase", letterSpacing: 3, color: "#ccc",
              border: "1px solid rgba(255,255,255,0.1)", padding: "3px 5px", borderRadius: 3,
            }}>{overlayLabel}</span>
          </div>
        )}
      </div>

      {renderOwner()}
    </div>
  );
});

export default BeastCard;

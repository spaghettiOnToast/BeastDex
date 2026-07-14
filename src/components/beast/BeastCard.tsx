import { memo } from "react";
import { Link } from "react-router-dom";
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
  hasAllVariants?: boolean;
  /** When true, removes the card's own background so a parent (e.g. CometCard) provides it */
  noBg?: boolean;
  /** When true, uses larger font sizes for detail/dialog views */
  large?: boolean;
  className?: string;
};

function getAttr(attributes: BeastAttribute[], trait: string): string | number | null {
  const found = attributes.find((a) => a.trait_type.toLowerCase() === trait.toLowerCase());
  return found?.value ?? null;
}

function isTruthy(v: string | number | null): boolean {
  return v === "true" || v === "1" || v === 1;
}

const GOLD_FRAME = "linear-gradient(135deg, #e5d8b2 0%, #b79a5e 60%, #8a6d3b 100%)";
const RAINBOW   = "linear-gradient(90deg,#73FF73,#FFFF73,#FFBE73,#FF7373,#C073DC,#7373FF,#73FF73)";
const PIN_BG    = "#1b1b1f";
const PIN_IMAGE = "repeating-linear-gradient(102deg, rgba(36,36,40,0.35) 0 6px, rgba(27,27,31,0) 6px 12px)";
const PANEL     = "linear-gradient(180deg, #2d2d32 0%, #1e1e22 100%)";
const FONT      = "'VT323', monospace";

const TIER_COLORS: Record<number, string> = {
  1: "#ff8800", 2: "#8c00bf", 3: "#0000ff", 4: "#00ff00", 5: "#ffffff",
};

function LsLogo({ color }: { color: string }) {
  return (
    <svg viewBox="0 0 347 804" style={{ width: 9, height: 20, display: "block", flexShrink: 0 }}>
      <path fillRule="evenodd" clipRule="evenodd" fill={color}
        d="M242.9 629.232H69.4V349.536H0V699.071H242.9V629.232ZM312.3 69.9071V0H34.7V69.9071H0V314.582H104.1V384.489H242.9V314.582H347V69.9071H312.3ZM277.6 244.675H208.2V314.582H138.8V244.675H69.4V139.814H138.8V244.675H208.2V139.814H277.6V244.675ZM104.1 594.279H277.6V734.093H0V804H312.3V734.093H347V524.372H173.5V489.418H347V419.511H104.1V594.279Z"
      />
    </svg>
  );
}

function TrophyIcon() {
  return (
    <svg viewBox="0 0 18 18" style={{ width: 15, height: 15, display: "block" }}>
      <g fill="#c0c0c0" stroke="#8a8a8a" strokeWidth={1}>
        <rect x={4} y={6} width={10} height={8} rx={1} />
        <rect x={2} y={7} width={2} height={3} />
        <rect x={14} y={7} width={2} height={3} />
        <rect x={6} y={13} width={6} height={4} />
      </g>
    </svg>
  );
}

function CrownIcon() {
  return (
    <svg viewBox="0 0 20 19" style={{ width: 15, height: 15, display: "block" }}>
      <g fill="#e6c56e" stroke="#af8a3c" strokeWidth={1}>
        <path d="M2 14h16l-1.5 4h-13z" />
        <path d="m2 14 2-9 3 5 4-5 3 5 2-5 2 9Z" strokeLinejoin="round" strokeLinecap="round" />
        <circle cx={5} cy={5} r={1.2} fill="#fff3c4" />
        <circle cx={12} cy={5} r={1.2} fill="#fff3c4" />
        <circle cx={17} cy={5} r={1.2} fill="#fff3c4" />
      </g>
    </svg>
  );
}

function BoltIcon() {
  return (
    <svg viewBox="0 0 9 18" style={{ width: 7, height: 13, display: "block" }}>
      <path d="M6 2 2 9h5l-4 7" fill="none" stroke="#ffd166" strokeWidth={2} strokeLinejoin="round" />
    </svg>
  );
}

function HeartIcon() {
  return (
    <svg viewBox="0 0 26 24" style={{ width: 10, height: 9, display: "block" }}>
      <path d="M13 11c0-6 9-6 9 0s-9 10.5-9 10.5S4 17 4 11s9-6 9 0Z" fill="none" stroke="#ff6b6b" strokeWidth={3} />
    </svg>
  );
}

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
  noBg = false,
  large = false,
  className,
}: Props) {
  const { image, owner, attributes, numericId, power } = beast;

  const speciesName = getAttr(attributes, "Beast");
  const prefixName  = getAttr(attributes, "Prefix");
  const suffixName  = getAttr(attributes, "Suffix");
  const tier        = getAttr(attributes, "Tier");
  const level       = getAttr(attributes, "Level");
  const type        = getAttr(attributes, "Type");
  const health      = getAttr(attributes, "Health");
  const rank        = getAttr(attributes, "Rank");
  const shiny       = isTruthy(getAttr(attributes, "Shiny"));

  const affix = [prefixName, suffixName].filter(Boolean).join(" ");
  const displayName = String(speciesName ?? beast.name);
  const special = affix ? `"${affix}"` : "";

  const tierNum = typeof tier === "number" ? tier : parseInt(String(tier ?? ""), 10);
  const tierColor = TIER_COLORS[tierNum] ?? "#ffffff";
  const ringBg = shiny ? RAINBOW : GOLD_FRAME;

  // Size tokens — scale up for large (detail) variant
  const sz = {
    pad:        large ? "10px 12px 6px" : "8px 8px 4px",
    prefixSize: large ? 15 : 12,
    nameSize:   large ? 30 : 22,
    rankSize:   large ? 18 : 14,
    artRatio:   large ? "220 / 220" : "220 / 160",
    artPad:     large ? "0 12px" : "0 8px",
    artRadius:  large ? 8 : 6,
    rowPad1:    large ? "6px 12px 0" : "4px 8px 0",
    rowPad2:    large ? "4px 12px 10px" : "3px 8px 8px",
    rowGap:     large ? 4 : 3,
    lbl:        large ? 14 : 11,
    val:        large ? 20 : 15,
    tilePad:    large ? "6px 4px" : "4px 2px",
  };

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
      {duplicateCount > 1 && !missing && (
        <div style={{
          position: "absolute", top: -6, right: -6, zIndex: 30,
          background: "#c4a44a", color: "#000", borderRadius: "50%",
          width: 18, height: 18, display: "flex", alignItems: "center",
          justifyContent: "center", fontSize: 10, fontWeight: "bold",
          boxShadow: "0 1px 4px rgba(0,0,0,0.5)",
        }}>{duplicateCount}</div>
      )}
      <div style={{
        position: "relative", width: "100%",
        borderRadius: 10, overflow: "hidden",
        backgroundColor: noBg ? "transparent" : PIN_BG,
        backgroundImage: noBg ? "none" : PIN_IMAGE,
        fontFamily: FONT, display: "flex", flexDirection: "column",
      }}>
        {/* Header: logo | names | rank */}
        <div style={{ display: "flex", alignItems: "center", padding: sz.pad, gap: 4 }}>
          <LsLogo color={tierColor} />

          <div style={{ flex: 1, textAlign: "center", minWidth: 0 }}>
            <div style={{ fontFamily: FONT, fontSize: sz.prefixSize, color: "#fff", letterSpacing: 1, lineHeight: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {special || " "}
            </div>
            <div style={{
              fontFamily: FONT, fontSize: sz.nameSize, letterSpacing: 1, lineHeight: 1,
              color: hasAllVariants && !missing ? "#39ff14" : "#fff",
              whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
            }}>
              {displayName}
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2, flexShrink: 0 }}>
            {rank != null ? (
              <>
                {Number(rank) === 1 ? <CrownIcon /> : <TrophyIcon />}
                <span style={{ fontFamily: FONT, fontSize: sz.rankSize, color: Number(rank) === 1 ? "#e6c56e" : "#b0b0b6", lineHeight: 1 }}>
                  {rank}
                </span>
              </>
            ) : numericId ? (
              <span style={{ fontFamily: FONT, fontSize: 11, color: "#444", lineHeight: 1 }}>#{numericId}</span>
            ) : null}
          </div>
        </div>

        {/* Art box */}
        <div style={{ padding: sz.artPad }}>
          <div style={{
            width: "100%", aspectRatio: sz.artRatio,
            borderRadius: sz.artRadius, background: "#000",
            border: "2px solid rgba(255,255,255,0.08)",
            display: "flex", alignItems: "center", justifyContent: "center",
            position: "relative", overflow: "hidden",
          }}>
            {image ? (
              <img src={image} alt={displayName} loading="lazy"
                style={{ maxWidth: "92%", maxHeight: "92%", objectFit: "contain", imageRendering: "pixelated" }} />
            ) : (
              <span style={{ color: "#555", fontSize: 11, fontFamily: FONT }}>No image</span>
            )}
            {missing && (
              <div style={{
                position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center",
                background: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)",
              }}>
                <span style={{
                  fontSize: 9, textTransform: "uppercase", letterSpacing: 3, color: "#ccc",
                  border: "1px solid rgba(255,255,255,0.1)", padding: "3px 5px", borderRadius: 3,
                }}>{overlayLabel}</span>
              </div>
            )}
          </div>
        </div>

        {/* Stat row 1: TIER / LEVEL / TYPE */}
        <div style={{ display: "flex", gap: sz.rowGap, padding: sz.rowPad1 }}>
          {[{ label: "TIER", value: tier ?? "—" }, { label: "LEVEL", value: level ?? "—" }, { label: "TYPE", value: type ?? "—" }].map(({ label, value }) => (
            <div key={label} style={{ flex: 1, background: PANEL, borderRadius: 4, padding: sz.tilePad, textAlign: "center" }}>
              <div style={{ fontFamily: FONT, fontSize: sz.lbl, color: "#c9c9d1", letterSpacing: "0.5px", lineHeight: 1 }}>{label}</div>
              <div style={{ fontFamily: FONT, fontSize: sz.val, color: "#fff", lineHeight: 1 }}>{value}</div>
            </div>
          ))}
        </div>

        {/* Stat row 2: POWER / HEALTH */}
        <div style={{ display: "flex", gap: sz.rowGap, padding: sz.rowPad2 }}>
          {[
            { label: "POWER", value: power ?? "—", icon: <BoltIcon /> },
            { label: "HEALTH", value: health ?? "—", icon: <HeartIcon /> },
          ].map(({ label, value, icon }) => (
            <div key={label} style={{ flex: 1, background: PANEL, borderRadius: 4, padding: sz.tilePad, textAlign: "center" }}>
              <div style={{ fontFamily: FONT, fontSize: sz.lbl, color: "#c9c9d1", letterSpacing: "0.5px", lineHeight: 1 }}>{label}</div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 3, marginTop: 1 }}>
                <span style={{ fontFamily: FONT, fontSize: sz.val, color: "#fff", lineHeight: 1 }}>{value}</span>
                {icon}
              </div>
            </div>
          ))}
        </div>

        {/* Gold gradient ring */}
        <div style={{
          position: "absolute", inset: 2, borderRadius: 8,
          border: "3px solid transparent",
          WebkitMask: "linear-gradient(#fff 0 0) padding-box, linear-gradient(#fff 0 0)",
          WebkitMaskComposite: "xor",
          maskComposite: "exclude",
          background: `${ringBg} border-box`,
          pointerEvents: "none", zIndex: 20,
        }} />
      </div>

      {renderOwner()}
    </div>
  );
});

export default BeastCard;

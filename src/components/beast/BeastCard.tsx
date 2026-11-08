import { memo, useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import {
  beastImageUrl,
  fetchBeastCardImgSrc,
  fetchBeastTokenMedia,
  hasBundledBeastImage,
  type BeastCardInput,
} from "@provable-games/collectables";
import type { Beast, BeastAttribute } from "../../services/beast";
import { CONTRACT_ADDRESS } from "../../services/beast/constants";
import { readRpcUrls } from "../../services/tx";
import { fetchV3CardImgSrc, spriteSpeciesName } from "../../services/beast/cardImage";
import { estimateSpeciesRank } from "../../services/beast/rankEstimate";

// On-chain card images for beasts without a bundled sprite (v3 species past the
// bundled set), keyed by token id. Shared across cards to avoid repeat RPC reads.
const onchainImageCache = new Map<string, Promise<string | null>>();

function fetchOnchainCardImage(tokenId: string): Promise<string | null> {
  let pending = onchainImageCache.get(tokenId);
  if (!pending) {
    pending = (async () => {
      // Configured RPC first, then the public default (some refuse anonymous reads).
      let lastErr: unknown;
      for (const rpcUrl of readRpcUrls()) {
        try {
          return (await fetchBeastTokenMedia({ rpcUrl, address: CONTRACT_ADDRESS, tokenId })).image;
        } catch (err) {
          lastErr = err;
        }
      }
      throw lastErr;
    })()
      .catch(() => {
        onchainImageCache.delete(tokenId);
        return null;
      });
    onchainImageCache.set(tokenId, pending);
  }
  return pending;
}

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

  // Rank: the API reports 0 for beasts it hasn't ranked yet. Show an estimate
  // (marked "~") instead — either already filled in (beast.rankEstimated) or
  // looked up here — and keep it out of the card art, which only draws real ranks.
  const attrRank = toNumber(getAttr(attributes, "Rank"));
  const needsRankEstimate =
    !missing &&
    !beast.rankEstimated &&
    attrRank < 1 &&
    Boolean(beast.tokenId) &&
    beast.visualEffects !== undefined &&
    beast.speciesId != null &&
    power != null;
  const { data: queriedRankEstimate } = useQuery({
    queryKey: ["rankEstimate", beast.speciesId, power],
    enabled: needsRankEstimate,
    queryFn: () => estimateSpeciesRank(beast.speciesId as number, power as number),
    staleTime: 30 * 60_000,
  });
  const estimatedRank = beast.rankEstimated ? attrRank : needsRankEstimate ? queriedRankEstimate ?? null : null;

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
      rank: beast.rankEstimated ? 0 : attrRank,
      shiny: isTruthy(getAttr(attributes, "Shiny")),
    };
  }, [attributes, beast.name, beast.rankEstimated, attrRank, power]);

  // Render the canonical on-chain card SVG (same generator as the token_uri) with
  // our hosted sprite as the art — no more hand-built DOM/CSS card layout.
  //
  // fetchBeastCardImgSrc fetches the sprite once and inlines it as a data URI
  // inside the card SVG, so the result is fully self-contained (no external
  // <image href> left to fetch) and safe to use directly as an <img src> — the
  // sandboxed image context an <img>'s SVG runs in blocks external fetches, which
  // is why a card whose art is a bare URL renders with a blank art box otherwise.
  const [cardImageSrc, setCardImageSrc] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    setCardImageSrc(null);
    // v3 beasts: render the real v3 card (grade/condition, rainbow chrome)
    // locally from the token id, as lootsurvivor.io does. If that fails (no
    // bundled sprite for the species), use the on-chain token_uri image.
    // Legacy beasts keep the legacy card renderer.
    const isV3 = beast.visualEffects !== undefined && Boolean(beast.tokenId);
    const src = isV3
      ? fetchV3CardImgSrc({
          tokenId: beast.tokenId,
          speciesName: cardInput.name,
          prefixName: cardInput.prefixName,
          suffixName: cardInput.suffixName,
          rank: cardInput.rank,
        }).catch(() => fetchOnchainCardImage(beast.tokenId))
      : (() => {
          // Placeholder/legacy cards may have no image (e.g. "Need to hunt"
          // slots): use the species' bundled sprite when there is one.
          const sprite = { name: spriteSpeciesName(cardInput.name), shiny: cardInput.shiny, animated: true };
          const art = image || (hasBundledBeastImage(sprite) ? beastImageUrl(sprite, { baseUrl: "/collectables" }) : "");
          return art ? fetchBeastCardImgSrc({ ...cardInput, image: art }) : Promise.resolve(null);
        })();
    src
      .then((s) => {
        if (alive) setCardImageSrc(s);
      })
      .catch(() => {
        // No art available: leave the card blank rather than throwing.
        if (alive) setCardImageSrc(null);
      });
    return () => { alive = false; };
  }, [cardInput, image, beast.visualEffects, beast.tokenId]);

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
      className={`@container transition-transform duration-150 hover:scale-[1.03] w-full${className ? ` ${className}` : ""}`}
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
        borderRadius: 10, overflow: "hidden", background: "#1b1b1f",
        boxShadow: hasAllVariants && !missing ? "0 0 0 2px #39ff14" : undefined,
      }}>
        {cardImageSrc && (
          <img
            src={cardImageSrc}
            alt={String(getAttr(attributes, "Beast") ?? beast.name)}
            style={{ width: "100%", height: "100%", display: "block" }}
          />
        )}
        {/* Grade badge: gold for 10, dark for 1-9, red when the beast has no
            grade at all (legacy beast or missing data) so it stands out.
            Placeholder cards (no token id) and "missing" slots get none. */}
        {!missing && beast.tokenId && (() => {
          const graded = beast.cardGrade != null && beast.cardGrade > 0;
          const perfect = beast.cardGrade === 10;
          return (
            <div
              title={graded ? `Card Grade ${beast.cardGrade} / 10` : "No card grade"}
              style={{
                // Top-left corner, on a solid (opaque) plate so the card's
                // logo and name underneath never show through the text.
                position: "absolute", top: 5, left: 5, zIndex: 20, lineHeight: 1,
                background: !graded ? "#dc2626" : perfect ? "#c4a44a" : "#0b0b0d",
                color: perfect ? "#000" : "#fff",
                border: `1px solid ${!graded ? "#fca5a5" : perfect ? "#f3dc8a" : "rgba(255,255,255,0.25)"}`,
                borderRadius: 4,
                boxShadow: "0 1px 4px rgba(0,0,0,0.6)",
                fontWeight: "bold", letterSpacing: 0.5,
              }}
              // Narrow cards (3-up on phones) get a compact "G8" so the
              // badge doesn't cover the beast's name.
              className="px-[3px] py-[2px] text-[7px] @min-[150px]:px-[5px] @min-[150px]:py-[3px] @min-[150px]:text-[9px]"
            >
              {graded ? (
                <>
                  <span className="@min-[150px]:hidden">G{beast.cardGrade}</span>
                  <span className="hidden @min-[150px]:inline">GRADE {beast.cardGrade}</span>
                </>
              ) : (
                <>
                  <span className="@min-[150px]:hidden">NO G</span>
                  <span className="hidden @min-[150px]:inline">NO GRADE</span>
                </>
              )}
            </div>
          );
        })()}
        {estimatedRank != null && estimatedRank > 0 && (
          <div
            title="Estimated rank — this beast hasn't been ranked yet"
            style={{
              position: "absolute", top: 5, right: 5, zIndex: 20, lineHeight: 1,
              background: "#0b0b0d", color: "#e2b94c", fontWeight: "bold", letterSpacing: 0.5,
              border: "1px dashed rgba(226,185,76,0.6)", borderRadius: 4,
              boxShadow: "0 1px 4px rgba(0,0,0,0.6)",
            }}
            className="px-[3px] py-[2px] text-[7px] @min-[150px]:px-[5px] @min-[150px]:py-[3px] @min-[150px]:text-[9px]"
          >
            ~#{estimatedRank}
          </div>
        )}
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

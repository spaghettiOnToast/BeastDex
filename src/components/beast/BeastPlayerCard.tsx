import { useEffect, useRef, useState } from "react";
import {
  hasNotesBackground,
  mountBeastPlayer,
  type BeastPlayerHandle,
  type BeastPlayerState,
  type BeastSoundData,
} from "@provable-games/collectables";
import type { Beast } from "../../services/beast";
import { fetchV3CardImgSrc } from "../../services/beast/cardImage";
import { fetchBeastSpecies } from "../../services/beast/species";
import { beastSoundLoader } from "../../services/beast/music";
import BeastCard from "./BeastCard";

type Props = {
  beast: Beast;
  /**
   * A specific track's sound to play instead of the token's default. When it
   * changes the player is rebuilt and starts playing (the change comes from a
   * click in the Music tab, so autoplay is allowed).
   */
  trackSound?: BeastSoundData | null;
  /** Every transport state change (ready / playing / error). */
  onStateChange?: (state: BeastPlayerState) => void;
  /** The live player handle (null while rebuilding), for external play/pause. */
  onPlayer?: (player: BeastPlayerHandle | null) => void;
};

function attr(beast: Beast, trait: string): string | null {
  const a = beast.attributes.find((x) => x.trait_type.toLowerCase() === trait.toLowerCase());
  return a?.value != null ? String(a.value) : null;
}

/**
 * A playable Beasts v3 card, exactly like its on-chain `animation_url` page:
 * the v3 card, its music, the notes background and the play button. Falls
 * back to the static BeastCard while loading or if the player can't start.
 */
export default function BeastPlayerCard({ beast, trackSound, onStateChange, onPlayer }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<BeastPlayerHandle | null>(null);
  const onStateRef = useRef(onStateChange);
  onStateRef.current = onStateChange;
  const onPlayerRef = useRef(onPlayer);
  onPlayerRef.current = onPlayer;
  const [artReady, setArtReady] = useState(false);
  const [failed, setFailed] = useState(false);

  const speciesName = attr(beast, "Beast") ?? beast.name;
  const prefixName = attr(beast, "Prefix");
  const suffixName = attr(beast, "Suffix");
  const rank = Number(attr(beast, "Rank") ?? 0) || 0;

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !beast.tokenId) return;
    let alive = true;
    setArtReady(false);
    setFailed(false);

    (async () => {
      try {
        const [card, species, defaultSound] = await Promise.all([
          fetchV3CardImgSrc({ tokenId: beast.tokenId, speciesName, prefixName, suffixName, rank }),
          fetchBeastSpecies().catch(() => []),
          trackSound === undefined ? beastSoundLoader.get(beast.tokenId) : Promise.resolve(null),
        ]);
        if (!alive) return;
        const notesPresets = species.find((s) => s.speciesId === beast.speciesId)?.notesPresets;
        playerRef.current?.dispose();
        playerRef.current = mountBeastPlayer(container, {
          card,
          sound: trackSound !== undefined ? trackSound : defaultSound?.sound ?? null,
          notes: hasNotesBackground(beast.visualEffects ?? 0, notesPresets),
          autoplay: trackSound != null,
          alt: beast.name,
          onStateChange: (s) => onStateRef.current?.(s),
          onArtReady: () => alive && setArtReady(true),
        });
        onPlayerRef.current?.(playerRef.current);
      } catch (err) {
        console.warn("[beast player] falling back to static card:", err);
        if (alive) setFailed(true);
      }
    })();

    return () => {
      alive = false;
      playerRef.current?.dispose();
      playerRef.current = null;
      onPlayerRef.current?.(null);
    };
  }, [beast.tokenId, beast.speciesId, beast.visualEffects, beast.name, speciesName, prefixName, suffixName, rank, trackSound]);

  return (
    <div style={{ position: "relative", width: "100%", aspectRatio: "250 / 350" }}>
      {(!artReady || failed) && (
        <div style={{ position: "absolute", inset: 0 }}>
          <BeastCard beast={beast} owned={false} showNotes={false} />
        </div>
      )}
      <div
        ref={containerRef}
        style={{
          position: "absolute",
          inset: 0,
          visibility: artReady && !failed ? "visible" : "hidden",
          borderRadius: 10,
          overflow: "hidden",
        }}
      />
    </div>
  );
}

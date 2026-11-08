import { useEffect, useRef, useState } from "react";
import { hasNotesBackground, mountBeastPlayer, type BeastPlayerHandle } from "@provable-games/collectables";
import { fetchBeastSpecies } from "../../services/beast/species";
import { beastSoundLoader } from "../../services/beast/music";

type Props = {
  /** The already-rendered card (data URI), drawn under the notes. */
  card: string;
  tokenId: string;
  speciesId?: number;
  visualEffects: number;
  alt: string;
};

/**
 * The MIDI notes background on a grid card, as lootsurvivor.io shows it.
 *
 * The notes are drawn from the beast's own song by the on-chain player script,
 * so this mounts the SDK player (no play button) over the static card. To keep
 * a grid light it only mounts while the card is near the viewport and is torn
 * down when it scrolls away; until the notes are ready the static card below
 * shows through unchanged.
 */
export default function MidiNotesArt({ card, tokenId, speciesId, visualEffects, alt }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [artReady, setArtReady] = useState(false);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || typeof IntersectionObserver !== "function") return;
    const io = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), { rootMargin: "200px" });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !visible) return;
    let alive = true;
    let player: BeastPlayerHandle | null = null;
    setArtReady(false);

    (async () => {
      try {
        const [species, sound] = await Promise.all([fetchBeastSpecies(), beastSoundLoader.get(tokenId)]);
        if (!alive || !sound?.sound) return;
        const notesPresets = species.find((s) => s.speciesId === speciesId)?.notesPresets;
        if (!hasNotesBackground(visualEffects, notesPresets)) return;
        player = mountBeastPlayer(container, {
          card,
          sound: sound.sound,
          notes: true,
          playButton: false,
          alt,
          onArtReady: () => alive && setArtReady(true),
        });
      } catch (err) {
        // Notes are decoration: keep the static card on any failure.
        console.warn("[midi notes] keeping static card:", err);
      }
    })();

    return () => {
      alive = false;
      player?.dispose();
      setArtReady(false);
    };
  }, [visible, card, tokenId, speciesId, visualEffects, alt]);

  return (
    <div
      ref={containerRef}
      aria-hidden={!artReady}
      style={{ position: "absolute", inset: 0, visibility: artReady ? "visible" : "hidden", pointerEvents: "none" }}
    />
  );
}

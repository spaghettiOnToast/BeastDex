import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { mountBeastPlayer, type BeastPlayerHandle } from "@provable-games/collectables";
import {
  ChevronDown,
  ListMusic,
  Music,
  Pause,
  Play,
  Repeat,
  Repeat1,
  Shuffle,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
} from "lucide-react";
import { cn } from "../../lib/utils";
import { fetchBeastById } from "../../services/beast";
import { fetchV3CardImgSrc } from "../../services/beast/cardImage";
import { fetchTrackSound } from "../../services/beast/music";
import { getAttributeValue } from "../../utils/beast";
import { announcePlayback, onPlayback } from "../../services/music/playbackBus";
import { PLAYLIST } from "../../services/music/playlist";

type Status = "idle" | "loading" | "playing" | "paused" | "error";
type RepeatMode = "all" | "one" | "off";

const PREFS_KEY = "beastdex:music";

type Prefs = { volume: number; muted: boolean; shuffle: boolean; repeat: RepeatMode; index: number };

function loadPrefs(): Prefs {
  const fallback: Prefs = { volume: 0.6, muted: false, shuffle: false, repeat: "all", index: 0 };
  try {
    const p = JSON.parse(localStorage.getItem(PREFS_KEY) ?? "{}") as Partial<Prefs>;
    return {
      volume: typeof p.volume === "number" && p.volume >= 0 && p.volume <= 1 ? p.volume : fallback.volume,
      muted: p.muted === true,
      shuffle: p.shuffle === true,
      repeat: p.repeat === "one" || p.repeat === "off" ? p.repeat : "all",
      index: typeof p.index === "number" && p.index >= 0 && p.index < PLAYLIST.length ? p.index : 0,
    };
  } catch {
    return fallback;
  }
}

function formatTime(secs: number): string {
  if (!Number.isFinite(secs) || secs < 0) return "0:00";
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

/**
 * The site-wide playlist: the Loot Survivor theme plus 75 Shiny MIDI beast
 * tracks, docked bottom-left on every page. MIDI tracks play through the SDK
 * beast player (the token's own on-chain synth); the theme is a plain MP3.
 * Nothing plays until the visitor presses play.
 */
export default function SiteMusicPlayer() {
  const { pathname } = useLocation();
  const [prefs] = useState(loadPrefs);
  const [index, setIndex] = useState(prefs.index);
  const [playToken, setPlayToken] = useState(0);
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [showList, setShowList] = useState(false);
  const [shuffle, setShuffle] = useState(prefs.shuffle);
  const [repeat, setRepeat] = useState<RepeatMode>(prefs.repeat);
  const [volume, setVolume] = useState(prefs.volume);
  const [muted, setMuted] = useState(prefs.muted);
  const [time, setTime] = useState({ current: 0, duration: 0 });

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const midiRef = useRef<BeastPlayerHandle | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  /** What the visitor wants: a pause that isn't theirs means the track ended (or something else took over). */
  const intentRef = useRef<"play" | "pause">("pause");
  const historyRef = useRef<number[]>([]);
  const failuresRef = useRef(0);
  const endTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const track = PLAYLIST[index];
  const started = playToken > 0;

  useEffect(() => {
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify({ volume, muted, shuffle, repeat, index }));
    } catch {
      /* private mode: preferences just don't stick */
    }
  }, [volume, muted, shuffle, repeat, index]);

  const goTo = useCallback((next: number, remember = true) => {
    setIndex((cur) => {
      if (remember && cur !== next) historyRef.current = [...historyRef.current.slice(-50), cur];
      return next;
    });
    intentRef.current = "play";
    setPlayToken((n) => n + 1);
  }, []);

  /** Move on from the current track: `auto` when it finished on its own. */
  const advance = useCallback(
    (auto: boolean) => {
      if (auto && repeat === "one") {
        goTo(index, false);
        return;
      }
      let next: number;
      if (shuffle && PLAYLIST.length > 1) {
        do next = Math.floor(Math.random() * PLAYLIST.length);
        while (next === index);
      } else {
        next = index + 1;
        if (next >= PLAYLIST.length) {
          if (auto && repeat === "off") {
            intentRef.current = "pause";
            setStatus("paused");
            return;
          }
          next = 0;
        }
      }
      goTo(next);
    },
    [goTo, index, repeat, shuffle],
  );
  const advanceRef = useRef(advance);
  advanceRef.current = advance;

  const previous = () => {
    const audio = audioRef.current;
    if (track.kind === "audio" && audio && audio.currentTime > 3) {
      audio.currentTime = 0;
      return;
    }
    const back = historyRef.current.pop();
    goTo(back ?? (index - 1 + PLAYLIST.length) % PLAYLIST.length, false);
  };

  const pauseAll = () => {
    intentRef.current = "pause";
    audioRef.current?.pause();
    midiRef.current?.pause();
  };

  const toggle = () => {
    if (!started || status === "error") {
      goTo(index, false);
      return;
    }
    if (status === "playing" || status === "loading") {
      pauseAll();
      if (status === "loading") setStatus("paused");
      return;
    }
    intentRef.current = "play";
    if (track.kind === "audio") {
      audioRef.current?.play().catch(() => setStatus("paused"));
    } else if (midiRef.current) {
      midiRef.current.play();
    } else {
      goTo(index, false);
    }
  };

  // A failed track is skipped (once around the list at most, so a dead API can't spin forever).
  const fail = useCallback((message: string) => {
    setError(message);
    setStatus("error");
    failuresRef.current += 1;
    if (intentRef.current === "play" && failuresRef.current < PLAYLIST.length) {
      setTimeout(() => intentRef.current === "play" && advanceRef.current(false), 1500);
    }
  }, []);

  // The one <audio> element, for the MP3 theme.
  useEffect(() => {
    const audio = new Audio();
    audio.preload = "none";
    audioRef.current = audio;
    const sync = () => setTime({ current: audio.currentTime, duration: audio.duration || 0 });
    const onPlay = () => {
      failuresRef.current = 0;
      setStatus("playing");
      announcePlayback("playlist");
    };
    const onPause = () => !audio.ended && setStatus("paused");
    const onEnded = () => advanceRef.current(true);
    const onError = () => audio.src && fail("Couldn't load this track.");
    audio.addEventListener("timeupdate", sync);
    audio.addEventListener("loadedmetadata", sync);
    audio.addEventListener("play", onPlay);
    audio.addEventListener("pause", onPause);
    audio.addEventListener("ended", onEnded);
    audio.addEventListener("error", onError);
    return () => {
      audio.pause();
      audio.removeAttribute("src");
      audio.removeEventListener("timeupdate", sync);
      audio.removeEventListener("loadedmetadata", sync);
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("pause", onPause);
      audio.removeEventListener("ended", onEnded);
      audio.removeEventListener("error", onError);
      audioRef.current = null;
    };
  }, [fail]);

  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = muted ? 0 : volume;
  }, [volume, muted]);

  // Another player (a beast card, the Tracks page) started: step aside.
  useEffect(
    () =>
      onPlayback((source) => {
        if (source !== "playlist") pauseAll();
      }),
    [],
  );

  // Load and start the current track each time one is picked.
  useEffect(() => {
    if (!started) return;
    const audio = audioRef.current;
    const container = containerRef.current;
    midiRef.current?.dispose();
    midiRef.current = null;
    if (endTimerRef.current) clearTimeout(endTimerRef.current);
    audio?.pause();
    setError(null);
    setTime({ current: 0, duration: 0 });
    let alive = true;

    if (track.kind === "audio") {
      if (!audio) return;
      setStatus("loading");
      if (audio.getAttribute("src") !== track.src) audio.src = track.src;
      audio.currentTime = 0;
      audio.play().catch(() => alive && setStatus("paused"));
      return () => {
        alive = false;
      };
    }

    audio?.removeAttribute("src");
    if (!container) return;
    setStatus("loading");
    (async () => {
      try {
        const beast = await fetchBeastById(track.tokenId);
        const attr = (k: string) => (beast ? (getAttributeValue(beast, k) as string | undefined) : undefined);
        const [card, sound] = await Promise.all([
          fetchV3CardImgSrc({
            tokenId: track.tokenId,
            speciesName: String(attr("Beast") ?? beast?.name ?? ""),
            prefixName: attr("Prefix"),
            suffixName: attr("Suffix"),
            rank: Number(attr("Rank") ?? 0) || 0,
          }),
          fetchTrackSound(track.tokenId, track.track),
        ]);
        if (!alive) return;
        let wasPlaying = false;
        const handle: BeastPlayerHandle = mountBeastPlayer(container, {
          card,
          sound,
          playButton: false,
          autoplay: intentRef.current === "play",
          alt: track.title,
          onStateChange: (s) => {
            if (!alive) return;
            if (s.error) {
              fail(s.error);
              return;
            }
            if (!s.ready) return;
            if (s.playing) {
              wasPlaying = true;
              failuresRef.current = 0;
              if (endTimerRef.current) clearTimeout(endTimerRef.current);
              setStatus("playing");
              announcePlayback("playlist");
              return;
            }
            setStatus("paused");
            // Stopped without the visitor asking: the song ended, unless another player
            // took over (that one announces itself within the wait).
            if (wasPlaying && intentRef.current === "play") {
              if (endTimerRef.current) clearTimeout(endTimerRef.current);
              endTimerRef.current = setTimeout(() => {
                if (alive && intentRef.current === "play" && midiRef.current === handle && !handle.state.playing) {
                  advanceRef.current(true);
                }
              }, 800);
            }
          },
        });
        midiRef.current = handle;
      } catch (err) {
        console.warn("[site music] couldn't start track:", err);
        if (alive) fail("Couldn't load this track.");
      }
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- rebuild only when a track is (re)picked
  }, [playToken]);

  useEffect(
    () => () => {
      midiRef.current?.dispose();
      if (endTimerRef.current) clearTimeout(endTimerRef.current);
    },
    [],
  );

  const playing = status === "playing";
  const loading = status === "loading";
  // The Tracks page docks its own player bar along the bottom.
  const lifted = pathname.startsWith("/tracks");

  const iconBtn =
    "flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-zinc-300 transition-colors hover:bg-white/10 hover:text-white disabled:opacity-40";

  const playButton = (size: "sm" | "lg") => (
    <button
      type="button"
      onClick={toggle}
      aria-label={playing ? "Pause music" : "Play music"}
      className={cn(
        "flex flex-shrink-0 items-center justify-center rounded-full bg-gold text-black transition-colors hover:bg-gold/90",
        size === "lg" ? "h-11 w-11" : "h-8 w-8",
      )}
    >
      {loading ? (
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-black border-t-transparent" />
      ) : playing ? (
        <Pause className="h-4 w-4" />
      ) : (
        <Play className="h-4 w-4 translate-x-[1px]" />
      )}
    </button>
  );

  return (
    <div
      className={cn(
        "fixed left-4 z-40 transition-[bottom] duration-200",
        lifted ? "bottom-24" : "bottom-4",
      )}
      style={{ marginBottom: "env(safe-area-inset-bottom, 0px)" }}
    >
      {/* Collapsed: a pill with the essentials. */}
      <div
        className={cn(
          "flex items-center gap-1 rounded-full border border-white/10 bg-black/85 p-1 pr-2 shadow-xl backdrop-blur-md",
          expanded && "hidden",
        )}
      >
        <button
          type="button"
          onClick={() => setExpanded(true)}
          aria-label="Open music player"
          className={cn(iconBtn, playing && "text-gold")}
        >
          <Music className={cn("h-4 w-4", playing && "animate-pulse")} />
        </button>
        {playButton("sm")}
        <button type="button" onClick={() => advance(false)} aria-label="Next track" className={iconBtn}>
          <SkipForward className="h-4 w-4" />
        </button>
        {started && (
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="hidden max-w-[10rem] truncate text-left text-[11px] font-semibold text-zinc-300 hover:text-white sm:block"
          >
            {track.title}
          </button>
        )}
      </div>

      {/* Expanded: the full player. Always mounted, as it holds the MIDI player. */}
      <div
        className={cn(
          "w-[min(20rem,calc(100vw-2rem))] rounded-2xl border border-white/10 bg-black/90 p-3 shadow-2xl backdrop-blur-md",
          !expanded && "hidden",
        )}
      >
        <div className="mb-2 flex items-center justify-between">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-gold/80">BeastDex Radio</p>
          <div className="flex items-center gap-0.5">
            <button
              type="button"
              onClick={() => setShowList((v) => !v)}
              aria-label={showList ? "Hide playlist" : "Show playlist"}
              aria-pressed={showList}
              className={cn(iconBtn, "h-7 w-7", showList && "text-gold")}
            >
              <ListMusic className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => setExpanded(false)}
              aria-label="Minimise music player"
              className={cn(iconBtn, "h-7 w-7")}
            >
              <ChevronDown className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative h-[67px] w-12 flex-shrink-0 overflow-hidden rounded bg-zinc-900">
            <div ref={containerRef} className={cn("absolute inset-0", track.kind !== "beast" && "hidden")} />
            {track.kind === "audio" && (
              <img
                src="/ls-skull.png"
                alt=""
                className="absolute inset-0 m-auto w-9"
                style={{ imageRendering: "pixelated" }}
              />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-bold text-white">{track.title}</p>
            <p className="truncate text-[11px] text-zinc-400">
              {status === "error" ? <span className="text-red-400">{error}</span> : track.subtitle}
            </p>
            <p className="text-[10px] text-zinc-500">
              Track {index + 1} of {PLAYLIST.length}
            </p>
          </div>
        </div>

        {track.kind === "audio" ? (
          <div className="mt-3 flex items-center gap-2 text-[10px] tabular-nums text-zinc-500">
            <span>{formatTime(time.current)}</span>
            <input
              type="range"
              min={0}
              max={time.duration || 0}
              step={0.1}
              value={time.current}
              disabled={!time.duration}
              onChange={(e) => {
                const t = Number(e.target.value);
                if (audioRef.current) audioRef.current.currentTime = t;
                setTime((prev) => ({ ...prev, current: t }));
              }}
              aria-label="Seek"
              className="h-1 flex-1 cursor-pointer accent-gold"
            />
            <span>{formatTime(time.duration)}</span>
          </div>
        ) : (
          <p className="mt-3 text-center text-[10px] text-zinc-500">On-chain MIDI, played by the beast&apos;s own synth</p>
        )}

        <div className="mt-2 flex items-center justify-center gap-2">
          <button
            type="button"
            onClick={() => setShuffle((v) => !v)}
            aria-label="Shuffle"
            aria-pressed={shuffle}
            className={cn(iconBtn, shuffle && "text-gold")}
          >
            <Shuffle className="h-4 w-4" />
          </button>
          <button type="button" onClick={previous} aria-label="Previous track" className={iconBtn}>
            <SkipBack className="h-4 w-4" />
          </button>
          {playButton("lg")}
          <button type="button" onClick={() => advance(false)} aria-label="Next track" className={iconBtn}>
            <SkipForward className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setRepeat((r) => (r === "all" ? "one" : r === "one" ? "off" : "all"))}
            aria-label={repeat === "all" ? "Repeat playlist" : repeat === "one" ? "Repeat this track" : "Repeat off"}
            title={repeat === "all" ? "Repeat playlist" : repeat === "one" ? "Repeat this track" : "Repeat off"}
            className={cn(iconBtn, repeat !== "off" && "text-gold")}
          >
            {repeat === "one" ? <Repeat1 className="h-4 w-4" /> : <Repeat className="h-4 w-4" />}
          </button>
        </div>

        <div className="mt-2 flex items-center gap-2" title={track.kind === "beast" ? "Volume applies to the theme; MIDI tracks play at the synth's level" : undefined}>
          <button
            type="button"
            onClick={() => setMuted((m) => !m)}
            aria-label={muted ? "Unmute" : "Mute"}
            className={cn(iconBtn, "h-7 w-7")}
          >
            {muted || volume === 0 ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
          </button>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={muted ? 0 : volume}
            onChange={(e) => {
              setVolume(Number(e.target.value));
              setMuted(false);
            }}
            aria-label="Volume"
            className="h-1 flex-1 cursor-pointer accent-gold"
          />
        </div>

        {showList && (
          <ol className="mt-3 max-h-60 space-y-0.5 overflow-y-auto border-t border-white/[0.06] pt-2">
            {PLAYLIST.map((t, i) => (
              <li key={t.key}>
                <button
                  type="button"
                  onClick={() => goTo(i)}
                  className={cn(
                    "flex w-full items-center gap-2 rounded px-2 py-1 text-left text-[11px] transition-colors hover:bg-white/[0.06]",
                    i === index ? "text-gold" : "text-zinc-300",
                  )}
                >
                  <span className="w-5 flex-shrink-0 text-right tabular-nums text-zinc-500">
                    {i === index && playing ? <Music className="ml-auto h-3 w-3 animate-pulse text-gold" /> : i + 1}
                  </span>
                  <span className="min-w-0 flex-1 truncate">{t.title}</span>
                  <span className="flex-shrink-0 text-[9px] text-zinc-500">{t.kind === "audio" ? "Theme" : t.track === "named" ? "Named" : "Check"}</span>
                </button>
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}

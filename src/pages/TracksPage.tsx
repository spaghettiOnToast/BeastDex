import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { beastImageUrl, hasBundledBeastImage, type BeastSpecies } from "@provable-games/collectables";
import { Crown, Music, Pause, Play, Search } from "lucide-react";
import TopBar from "../components/header/TopBar";
import { AppLayout } from "../components/layout/AppLayout";
import TrackPlayerBar, { type NowPlaying, type PlayerStatus } from "../components/tracks/TrackPlayerBar";
import { cn } from "../lib/utils";
import { fetchBeastSpecies, type Beast } from "../services/beast";
import { spriteSpeciesName } from "../services/beast/cardImage";
import { EFFECT_NAMES, EFFECT_TITLES, MUSIC_MODE_LABELS } from "../services/beast/music";
import {
  fetchSpeciesKings,
  fetchSpeciesSongSettings,
  fetchSpeciesStandIn,
  searchNamedSongs,
  NAMED_SONG_REF,
  SOUND_CHECK_REF,
  SPECIES_SONG_REF,
  type SpeciesSongSettings,
} from "../services/beast/tracks";

type Player = {
  current: NowPlaying | null;
  status: PlayerStatus;
  /** Play an item, or toggle it when it's already the current one. */
  play: (item: NowPlaying) => void;
};

const TYPES = ["Magic", "Hunter", "Brute"] as const;
const TIERS = [1, 2, 3, 4, 5] as const;

function attr(beast: Beast, trait: string): string | null {
  const a = beast.attributes.find((x) => x.trait_type.toLowerCase() === trait.toLowerCase());
  return a?.value != null ? String(a.value) : null;
}

function shortName(beast: Beast): string {
  const p = attr(beast, "Prefix");
  const s = attr(beast, "Suffix");
  return p && s ? `"${p} ${s}"` : beast.name;
}

function tokenEffect(beast: Beast): number | null {
  const preset = beast.soundEffects ?? beast.visualEffects;
  return preset != null && EFFECT_NAMES[preset] ? preset : null;
}

/** True once the element has scrolled near the viewport (then stays true). */
function useSeen<T extends Element>(): [React.RefObject<T | null>, boolean] {
  const ref = useRef<T>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || seen) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) setSeen(true);
      },
      { rootMargin: "200px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [seen]);
  return [ref, seen];
}

function PlayButton({
  player,
  item,
  label,
  disabled,
}: {
  player: Player;
  item: NowPlaying | null;
  label: string;
  disabled?: boolean;
}) {
  const isCurrent = item != null && player.current?.key === item.key;
  const playing = isCurrent && player.status === "playing";
  const loading = isCurrent && player.status === "loading";
  return (
    <button
      type="button"
      disabled={disabled || !item}
      onClick={() => item && player.play(item)}
      aria-label={`${playing ? "Pause" : "Play"} ${label}`}
      className={cn(
        "flex flex-1 items-center justify-center gap-1.5 rounded-md border px-2 py-1.5 text-[11px] font-semibold transition-colors disabled:opacity-40",
        isCurrent ? "border-gold bg-gold/15 text-gold" : "border-white/10 text-zinc-300 hover:border-gold/50 hover:text-gold",
      )}
    >
      {loading ? (
        <span className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
      ) : playing ? (
        <Pause className="h-3 w-3" />
      ) : (
        <Play className="h-3 w-3" />
      )}
      {label}
    </button>
  );
}

function Pill({ children, title, tone = "default" }: { children: React.ReactNode; title?: string; tone?: "default" | "gold" }) {
  return (
    <span
      title={title}
      className={cn(
        "rounded-full border px-1.5 py-0.5 text-[9px] font-semibold",
        tone === "gold" ? "border-gold/40 bg-gold/10 text-gold" : "border-white/10 bg-white/[0.04] text-zinc-300",
      )}
    >
      {children}
    </span>
  );
}

function SpeciesCard({ species, king, player }: { species: BeastSpecies; king: Beast | null | undefined; player: Player }) {
  const [ref, seen] = useSeen<HTMLDivElement>();
  const [standIn, setStandIn] = useState<Beast | null>(null);
  const [settings, setSettings] = useState<SpeciesSongSettings | null>(null);
  const carrier = king ?? standIn;

  // No King yet: find any beast of the species to play its songs from.
  useEffect(() => {
    if (!seen || king !== null) return;
    let alive = true;
    fetchSpeciesStandIn(species.speciesId)
      .then((b) => alive && setStandIn(b))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [seen, king, species.speciesId]);

  useEffect(() => {
    if (!seen || !carrier) return;
    let alive = true;
    fetchSpeciesSongSettings(species.speciesId, carrier.tokenId)
      .then((s) => alive && setSettings(s))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [seen, carrier, species.speciesId]);

  const sprite = { name: spriteSpeciesName(species.name), shiny: false, animated: false };
  const img = hasBundledBeastImage(sprite) ? beastImageUrl(sprite, { baseUrl: "/collectables" }) : null;
  const checkEffect = carrier ? tokenEffect(carrier) : null;

  const songItem: NowPlaying | null = carrier && {
    key: `species:${species.speciesId}:${SPECIES_SONG_REF}`,
    beast: carrier,
    track: SPECIES_SONG_REF,
    title: `${species.name} · Species Song`,
    subtitle: [
      settings?.preset != null ? EFFECT_NAMES[settings.preset] : null,
      settings?.mode ? MUSIC_MODE_LABELS[settings.mode] : null,
      king ? `King ${shortName(king)}` : null,
    ].filter(Boolean).join(" · "),
  };
  const checkItem: NowPlaying | null = carrier && {
    key: `species:${species.speciesId}:${SOUND_CHECK_REF}`,
    beast: carrier,
    track: SOUND_CHECK_REF,
    title: `${species.name} · Sound Check`,
    subtitle: `As performed by ${shortName(carrier)}${checkEffect != null ? ` · ${EFFECT_NAMES[checkEffect]}` : ""}`,
  };

  return (
    <div ref={ref} className="flex flex-col gap-2 rounded-xl border border-white/[0.06] bg-surface/60 p-3">
      <div className="flex items-center gap-3">
        <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center overflow-hidden rounded-lg bg-black/40">
          {img ? <img src={img} alt="" loading="lazy" className="h-full w-full object-contain" /> : <Music className="h-5 w-5 text-zinc-600" />}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold text-white">{species.name}</p>
          <p className="text-[10px] text-zinc-500">
            T{species.tier} · {species.type}
          </p>
        </div>
      </div>

      <div className="flex min-h-[18px] flex-wrap items-center gap-1">
        {settings?.preset != null && (
          <Pill tone="gold" title={`Species Song effects, set by the King: ${EFFECT_TITLES[settings.preset]}`}>
            {EFFECT_NAMES[settings.preset]}
          </Pill>
        )}
        {settings?.mode && <Pill title="Species Song sound mode, set by the King">{MUSIC_MODE_LABELS[settings.mode]}</Pill>}
      </div>

      <div className="flex gap-1.5">
        <PlayButton player={player} item={songItem} label="Species Song" />
        <PlayButton player={player} item={checkItem} label="Sound Check" />
      </div>

      <p className="truncate text-[10px] text-zinc-500">
        {king ? (
          <>
            <Crown className="mr-1 inline h-3 w-3 text-gold" />
            <Link to={`/beasts/${encodeURIComponent(king.tokenId)}`} className="text-zinc-300 hover:text-gold hover:underline">
              {shortName(king)}
            </Link>
          </>
        ) : king === null ? (
          "No King yet (nothing ranked)"
        ) : (
          "Finding the King…"
        )}
      </p>
    </div>
  );
}

function NamedSongSearch({ species, player }: { species: BeastSpecies[]; player: Player }) {
  const [query, setQuery] = useState("");
  const [speciesId, setSpeciesId] = useState<number | "">("");
  const [results, setResults] = useState<Beast[] | null>(null);
  const [state, setState] = useState<"idle" | "loading" | "error">("idle");

  useEffect(() => {
    const q = query.trim();
    if (q.length < 3) {
      setResults(null);
      setState("idle");
      return;
    }
    let alive = true;
    setState("loading");
    const t = setTimeout(() => {
      searchNamedSongs(q, speciesId || undefined)
        .then((r) => {
          if (!alive) return;
          setResults(r);
          setState("idle");
        })
        .catch(() => alive && setState("error"));
    }, 300);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [query, speciesId]);

  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-lg font-bold text-white">Named Songs</h2>
        <p className="text-sm text-zinc-400">
          Every named beast has its own song, composed from its prefix and suffix. Search a name to hear it.
        </p>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <label className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder='Search a name, e.g. "Agony Bane"'
            className="w-full rounded-lg border border-white/10 bg-surface/60 py-2 pl-9 pr-3 text-sm text-white placeholder:text-zinc-500 focus:border-gold/50 focus:outline-none"
          />
        </label>
        <select
          value={speciesId}
          onChange={(e) => setSpeciesId(e.target.value ? Number(e.target.value) : "")}
          className="rounded-lg border border-white/10 bg-surface/60 px-3 py-2 text-sm text-white focus:border-gold/50 focus:outline-none"
          aria-label="Species"
        >
          <option value="">All species</option>
          {species.map((s) => (
            <option key={s.speciesId} value={s.speciesId}>
              {s.name}
            </option>
          ))}
        </select>
      </div>

      {state === "loading" && <p className="text-xs text-zinc-500">Searching…</p>}
      {state === "error" && <p className="text-xs text-red-400">Search failed. Try again.</p>}
      {state === "idle" && results && results.length === 0 && (
        <p className="text-xs text-zinc-500">No named beasts match &ldquo;{query.trim()}&rdquo;.</p>
      )}
      {results && results.length > 0 && (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {results.map((b) => {
            const fx = tokenEffect(b);
            const item: NowPlaying = {
              key: `named:${b.tokenId}`,
              beast: b,
              track: NAMED_SONG_REF,
              title: `${b.name} · Named Song`,
              subtitle: fx != null ? `${EFFECT_NAMES[fx]} (set by its rarity)` : "Named Song",
            };
            return (
              <div key={b.tokenId} className="flex items-center gap-2 rounded-lg border border-white/[0.06] bg-surface/60 p-2">
                <div className="min-w-0 flex-1">
                  <Link
                    to={`/beasts/${encodeURIComponent(b.tokenId)}`}
                    className="block truncate text-xs font-bold text-zinc-100 hover:text-gold hover:underline"
                  >
                    {b.name}
                  </Link>
                  <div className="mt-0.5 flex items-center gap-1">
                    {fx != null && (
                      <Pill tone="gold" title={`${EFFECT_TITLES[fx]}. Set by this beast's rarity.`}>
                        {EFFECT_NAMES[fx]}
                      </Pill>
                    )}
                    {b.visual && b.visual !== "Regular" && <Pill>{b.visual}</Pill>}
                  </div>
                </div>
                <div className="w-24 flex-shrink-0">
                  <PlayButton player={player} item={item} label="Play" />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

/** Tracks: every species' Species Song and Sound Check, plus a Named Song search. */
function TracksPage() {
  const [species, setSpecies] = useState<BeastSpecies[] | null>(null);
  const [kings, setKings] = useState<Map<number, Beast> | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [tier, setTier] = useState<number | null>(null);
  const [type, setType] = useState<string | null>(null);
  const [filter, setFilter] = useState("");

  const [current, setCurrent] = useState<NowPlaying | null>(null);
  const [status, setStatus] = useState<PlayerStatus>("loading");
  const [toggleSignal, setToggleSignal] = useState(0);

  useEffect(() => {
    fetchBeastSpecies().then(setSpecies).catch(() => setLoadError(true));
    fetchSpeciesKings()
      .then(setKings)
      .catch(() => setKings(new Map()));
  }, []);

  const player: Player = useMemo(
    () => ({
      current,
      status,
      play: (item) => {
        if (current?.key === item.key) setToggleSignal((n) => n + 1);
        else setCurrent(item);
      },
    }),
    [current, status],
  );

  const visible = useMemo(() => {
    const f = filter.trim().toLowerCase();
    return (species ?? []).filter(
      (s) => (tier == null || s.tier === tier) && (type == null || s.type === type) && (!f || s.name.toLowerCase().includes(f)),
    );
  }, [species, tier, type, filter]);

  const chip = (active: boolean) =>
    cn(
      "rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors",
      active ? "border-gold bg-gold/15 text-gold" : "border-white/10 text-zinc-400 hover:text-white",
    );

  return (
    <AppLayout topBar={<TopBar />}>
      <div className={cn("space-y-10", current && "pb-24")}>
        <header>
          <div className="mb-2 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-gold/30 bg-gold/10">
              <Music className="h-5 w-5 text-gold" />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-gold/80">Beast Music</p>
              <h1 className="text-2xl font-bold leading-tight text-white sm:text-3xl">Tracks</h1>
            </div>
          </div>
          <p className="mt-2 max-w-2xl text-sm text-zinc-400">
            Every beast has its own soundtrack, composed entirely on Starknet. The songs, the synth and the player are
            all on-chain, so a beast&apos;s music plays from its token wherever it&apos;s shown. The music was made with{" "}
            <a
              href="https://x.com/CaseyWescott"
              target="_blank"
              rel="noopener noreferrer"
              className="text-zinc-200 hover:text-gold hover:underline"
            >
              Casey Wescott
            </a>{" "}
            of Fleet Foxes, and is built on his Midi Fun composer.{" "}
            <a
              href="https://x.com/LootSurvivor/status/2118390500092993656"
              target="_blank"
              rel="noopener noreferrer"
              className="text-gold/80 hover:text-gold hover:underline"
            >
              Announcement
            </a>
          </p>

          <div className="mt-4 grid max-w-4xl grid-cols-1 gap-3 text-xs text-zinc-400 sm:grid-cols-3">
            <div className="rounded-lg border border-white/[0.06] bg-surface/40 p-3">
              <p className="mb-1 font-bold text-zinc-200">The tracks</p>
              Each beast starts with a <span className="text-zinc-200">Sound Check</span>, its species&apos;{" "}
              <span className="text-zinc-200">Species Song</span> and, if it&apos;s named, a{" "}
              <span className="text-zinc-200">Named Song</span> composed from its prefix and suffix. Anyone can buy a beast
              more songs for 1 SKULL each, and new Editions arrive every 30 days.
            </div>
            <div className="rounded-lg border border-white/[0.06] bg-surface/40 p-3">
              <p className="mb-1 font-bold text-zinc-200">The effects</p>
              Rarity sets how a beast performs: Regular plays as <span className="text-zinc-200">Written</span>, Shiny
              adds <span className="text-zinc-200">Mega</span>, MIDI adds <span className="text-zinc-200">Echo</span>, and
              Shiny MIDI gets <span className="text-zinc-200">Mega + echo</span>. Each species&apos; King chooses the
              effects for its Species Song.
            </div>
            <div className="rounded-lg border border-white/[0.06] bg-surface/40 p-3">
              <p className="mb-1 font-bold text-zinc-200">Live or Original</p>
              In <span className="text-zinc-200">Original</span> mode a song always sounds as first composed. In{" "}
              <span className="text-zinc-200">Live</span> mode it drifts with the chain, following day, week and month
              block hashes, so it changes over time.
            </div>
          </div>
        </header>

        <NamedSongSearch species={species ?? []} player={player} />

        <section className="space-y-3">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-white">Species Songs</h2>
              <p className="text-sm text-zinc-400">
                Played from each species&apos; King. Sound Checks use the King&apos;s own rarity effects.
              </p>
            </div>
            <input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filter species"
              className="w-full rounded-lg border border-white/10 bg-surface/60 px-3 py-1.5 text-sm text-white placeholder:text-zinc-500 focus:border-gold/50 focus:outline-none sm:w-48"
            />
          </div>
          <div className="flex flex-wrap gap-1.5">
            <button type="button" className={chip(tier == null)} onClick={() => setTier(null)}>
              All tiers
            </button>
            {TIERS.map((t) => (
              <button key={t} type="button" className={chip(tier === t)} onClick={() => setTier(tier === t ? null : t)}>
                T{t}
              </button>
            ))}
            <span className="mx-1 w-px bg-white/10" />
            <button type="button" className={chip(type == null)} onClick={() => setType(null)}>
              All types
            </button>
            {TYPES.map((t) => (
              <button key={t} type="button" className={chip(type === t)} onClick={() => setType(type === t ? null : t)}>
                {t}
              </button>
            ))}
          </div>

          {loadError ? (
            <p className="text-sm text-red-400">Couldn&apos;t load the species list.</p>
          ) : !species ? (
            <div className="flex justify-center py-10">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-gold border-t-transparent" />
            </div>
          ) : visible.length === 0 ? (
            <p className="text-sm text-zinc-500">No species match these filters.</p>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {visible.map((s) => (
                <SpeciesCard
                  key={s.speciesId}
                  species={s}
                  // undefined while Kings load; null when the species has none
                  king={kings ? kings.get(s.speciesId) ?? null : undefined}
                  player={player}
                />
              ))}
            </div>
          )}
        </section>
      </div>

      <TrackPlayerBar
        item={current}
        toggleSignal={toggleSignal}
        onStatus={setStatus}
        onClose={() => setCurrent(null)}
      />
    </AppLayout>
  );
}

export default TracksPage;

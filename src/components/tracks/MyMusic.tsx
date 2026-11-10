import { useCallback, useEffect, useMemo, useState } from "react";
import { useAccount } from "@starknet-react/core";
import type { Call } from "starknet";
import type { BeastTrackInfo } from "@provable-games/collectables";
import { CheckCircle2, Crown, Loader2, RefreshCw, Search, ShoppingBag, Star } from "lucide-react";
import { cn } from "../../lib/utils";
import { fetchAllOwnedBeasts, type Beast } from "../../services/beast";
import {
  clearTrackSounds,
  fetchBeastMusic,
  fetchTrackLists,
  onMusicChange,
  parseTrackRef,
  trackRefOf,
  EFFECT_NAMES,
  EFFECT_TITLES,
  type BeastMusic,
  type TrackList,
} from "../../services/beast/music";
import {
  bulkBuyTrackCalls,
  fetchSharedSongPreset,
  fetchSkullBalance,
  formatSkull,
  setDefaultTrackCall,
  txErrorMessage,
  MAX_BULK_MUSIC_BEASTS,
  TRACK_PRICE_WEI,
} from "../../services/beast/musicActions";
import { waitForTx } from "../../services/tx";
import { PlayButton, type Player } from "./PlayButton";
import { Pager, PAGE_SIZE } from "./Pager";

/** What a beast's default track is, as a filter group. */
type Playing = "soundCheck" | "species" | "named" | "bought";
type Filter = "all" | Playing | "kings" | "hasBought";

const NEWEST = "newest";

function playingKind(ref: string | null): Playing | null {
  if (!ref) return null;
  if (ref === "shared:0") return "soundCheck";
  if (ref.startsWith("shared:")) return "species";
  if (ref === "named") return "named";
  if (ref.startsWith("individual:")) return "bought";
  return null;
}

const speciesName = (b: Beast) => String(b.attributes.find((a) => a.trait_type === "Beast")?.value ?? b.name);
const isBought = (t: BeastTrackInfo) => t.ref.startsWith("individual:");
/** `shared:<id>` with id ≥ 1: a Species Song, whose effects the species' King sets. */
const speciesSongId = (ref: string | null): number | null => {
  const m = ref ? /^shared:(\d+)$/.exec(ref) : null;
  return m && Number(m[1]) >= 1 ? Number(m[1]) : null;
};
const sameToken = (a: string, b: string) => {
  try {
    return BigInt(a) === BigInt(b);
  } catch {
    return a === b;
  }
};
const boughtId = (t: BeastTrackInfo) => Number(t.ref.split(":")[1] ?? 0);

/** The track `target` means for this beast, when it has it ready. */
function trackFor(list: TrackList, target: string): BeastTrackInfo | null {
  const ready = list.tracks.filter((t) => t.status === "ready");
  if (target === NEWEST) {
    return ready.filter(isBought).reduce<BeastTrackInfo | null>((a, t) => (!a || boughtId(t) > boughtId(a) ? t : a), null);
  }
  return ready.find((t) => t.ref === target) ?? null;
}

const toList = (m: BeastMusic): TrackList => ({ effective: trackRefOf(m.state.effective), tracks: m.tracks });

/** The API caches /music for 10s, so polling faster than this only re-reads the cache. */
const POLL_INTERVAL_MS = 10_000;

/**
 * Poll /music (track metadata, no MIDI) for several tokens, a few at a time,
 * until each reflects the change. Starts after one cache window, since the
 * indexer lags the chain, and drops each token as soon as it shows up.
 * Returns what was last seen per token. Only used after buying songs: a
 * default-track change is known from the transaction itself.
 */
async function waitForMany(ids: string[], done: (id: string, m: BeastMusic) => boolean): Promise<Map<string, BeastMusic>> {
  const seen = new Map<string, BeastMusic>();
  let todo = [...ids];
  for (let round = 0; round < 6 && todo.length; round++) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    let i = 0;
    const queue = todo;
    await Promise.all(
      Array.from({ length: Math.min(6, queue.length) }, async () => {
        while (i < queue.length) {
          const id = queue[i++];
          const m = await fetchBeastMusic(id).catch(() => null);
          if (m) seen.set(id, m);
        }
      }),
    );
    todo = todo.filter((id) => !seen.has(id) || !done(id, seen.get(id)!));
  }
  ids.forEach(clearTrackSounds);
  return seen;
}

type Props = { address: string; player: Player; kings: Map<number, Beast> | null };

/**
 * The connected wallet's beasts and their music: what each plays, which are
 * Kings, every song they've bought. Pick beasts to set one default track on
 * all of them, or buy each a new song, in a single transaction.
 */
export default function MyMusic({ address, player, kings }: Props) {
  const { account } = useAccount();
  const [beasts, setBeasts] = useState<Beast[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [lists, setLists] = useState<Record<string, TrackList | null>>({});
  const [reload, setReload] = useState(0);

  const [filter, setFilter] = useState<Filter>("all");
  const [species, setSpecies] = useState<number | null>(null);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const [boughtPage, setBoughtPage] = useState(0);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [target, setTarget] = useState<string | null>(null);
  const [busy, setBusy] = useState<{ action: string; phase: "wallet" | "confirming" | "indexing" } | null>(null);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [skull, setSkull] = useState<bigint | null>(null);

  // The wallet's beasts, then every beast's track list in batches.
  useEffect(() => {
    const ctrl = new AbortController();
    setBeasts(null);
    setLoadError(false);
    setLists({});
    setSelected(new Set());
    fetchAllOwnedBeasts(address)
      .then((owned) => {
        if (ctrl.signal.aborted) return;
        setBeasts(owned);
        return fetchTrackLists(
          owned.map((b) => b.tokenId),
          (batch) => setLists((prev) => ({ ...prev, ...batch })),
          ctrl.signal,
        );
      })
      .catch((err) => {
        if (ctrl.signal.aborted) return;
        console.warn("[my music] load failed:", err);
        setLoadError(true);
      });
    return () => ctrl.abort();
  }, [address, reload]);

  useEffect(() => {
    let alive = true;
    fetchSkullBalance(address)
      .then((b) => alive && setSkull(b))
      .catch(() => alive && setSkull(null));
    return () => {
      alive = false;
    };
  }, [address, reload]);

  /** King-set effects per Species Song, keyed `speciesId:sharedId` (read on-chain as rows need them). */
  const [kingPresets, setKingPresets] = useState<Record<string, number | null>>({});

  // A beast's music changed from its card (or a King changed Species Song effects): keep the table current.
  useEffect(
    () =>
      onMusicChange((change) => {
        if (change.kind === "token") {
          setLists((prev) => {
            const key = Object.keys(prev).find((id) => sameToken(id, change.tokenId));
            return key ? { ...prev, [key]: toList(change.music) } : prev;
          });
        } else {
          setKingPresets((prev) => ({ ...prev, [`${change.speciesId}:${change.sharedId}`]: change.preset }));
        }
      }),
    [],
  );

  const isKing = useCallback(
    (b: Beast) => b.speciesId != null && kings?.get(b.speciesId)?.tokenId === b.tokenId,
    [kings],
  );

  const all = useMemo(() => beasts ?? [], [beasts]);
  const loadedCount = all.filter((b) => b.tokenId in lists).length;
  const listsLoading = beasts != null && loadedCount < all.length;

  const matches = useCallback(
    (b: Beast, f: Filter) => {
      const list = lists[b.tokenId];
      if (f === "all") return true;
      if (f === "kings") return isKing(b);
      if (!list) return false;
      if (f === "hasBought") return list.tracks.some(isBought);
      return playingKind(list.effective) === f;
    },
    [lists, isKing],
  );

  const counts = useMemo(() => {
    const c: Record<Filter, number> = { all: 0, soundCheck: 0, species: 0, named: 0, bought: 0, kings: 0, hasBought: 0 };
    for (const b of all) for (const f of Object.keys(c) as Filter[]) if (matches(b, f)) c[f]++;
    return c;
  }, [all, matches]);

  const speciesOptions = useMemo(() => {
    const m = new Map<number, string>();
    for (const b of all) if (b.speciesId != null && !m.has(b.speciesId)) m.set(b.speciesId, speciesName(b));
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [all]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return all.filter(
      (b) =>
        matches(b, filter) &&
        (species == null || b.speciesId === species) &&
        (!q || b.name.toLowerCase().includes(q)),
    );
  }, [all, matches, filter, species, query]);

  useEffect(() => setPage(0), [filter, species, query]);

  const pageRows = useMemo(() => shown.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE), [shown, page]);

  // Species Songs on this page: read their King's effects (once per species + song).
  const neededPresets = pageRows
    .map((b) => {
      const id = speciesSongId(lists[b.tokenId]?.effective ?? null);
      return id != null && b.speciesId != null ? `${b.speciesId}:${id}` : null;
    })
    .filter((k): k is string => k != null && !(k in kingPresets))
    .filter((k, i, a) => a.indexOf(k) === i)
    .join(",");
  useEffect(() => {
    if (!neededPresets) return;
    const keys = neededPresets.split(",");
    setKingPresets((prev) => Object.fromEntries([...Object.entries(prev), ...keys.map((k) => [k, prev[k] ?? null])]));
    for (const key of keys) {
      const [speciesId, sharedId] = key.split(":").map(Number);
      fetchSharedSongPreset(speciesId, sharedId)
        .then((preset) => setKingPresets((prev) => ({ ...prev, [key]: preset })))
        .catch((err) => console.warn(`[my music] couldn't read Species Song effects ${key}:`, err));
    }
  }, [neededPresets]);

  /** The effects a beast's default track plays with, and who set them. */
  const effectOf = (b: Beast, list: TrackList | null | undefined) => {
    if (!list?.effective) return null;
    const songId = speciesSongId(list.effective);
    if (songId != null) {
      const preset = b.speciesId != null ? kingPresets[`${b.speciesId}:${songId}`] : null;
      return { preset: preset ?? null, source: "Set by the species' King for every beast of the species" };
    }
    const preset = b.soundEffects ?? b.visualEffects ?? null;
    const echoNote = list.effective === "shared:0" && preset != null && preset >= 2 ? " (Sound Checks skip the echo itself)" : "";
    return { preset, source: `Set by this beast's rarity${echoNote}` };
  };

  const chosen = useMemo(() => all.filter((b) => selected.has(b.tokenId)), [all, selected]);
  const chosenReady = useMemo(() => chosen.filter((b) => lists[b.tokenId]), [chosen, lists]);
  const atCap = selected.size >= MAX_BULK_MUSIC_BEASTS;

  /** Default-track choices for the selection: shared / named tracks any of them has, plus "newest bought". */
  const options = useMemo(() => {
    const byRef = new Map<string, { ref: string; label: string; order: number; count: number }>();
    let newest = 0;
    for (const b of chosenReady) {
      const list = lists[b.tokenId]!;
      if (trackFor(list, NEWEST)) newest++;
      for (const t of list.tracks) {
        if (isBought(t) || t.status !== "ready") continue;
        const o = byRef.get(t.ref) ?? { ref: t.ref, label: t.label, order: t.number ?? 99, count: 0 };
        o.count++;
        byRef.set(t.ref, o);
      }
    }
    const out = [...byRef.values()].sort((a, b) => a.order - b.order);
    if (newest) out.push({ ref: NEWEST, label: "Newest bought song", order: Infinity, count: newest });
    return out;
  }, [chosenReady, lists]);

  const plan = useMemo(() => {
    const change: { tokenId: string; ref: string }[] = [];
    let already = 0;
    let missing = 0;
    if (target) {
      for (const b of chosenReady) {
        const list = lists[b.tokenId]!;
        const t = trackFor(list, target);
        if (!t) missing++;
        else if (list.effective === t.ref) already++;
        else change.push({ tokenId: b.tokenId, ref: t.ref });
      }
    }
    return { change, already, missing };
  }, [chosenReady, lists, target]);

  const buyCost = TRACK_PRICE_WEI * BigInt(chosen.length);
  const shortfall = skull !== null && skull < buyCost ? buyCost - skull : 0n;

  /** Every bought song across the wallet, newest first. */
  const bought = useMemo(() => {
    const out: { beast: Beast; track: BeastTrackInfo; isDefault: boolean }[] = [];
    for (const b of all) {
      const list = lists[b.tokenId];
      for (const t of list?.tracks ?? []) if (isBought(t)) out.push({ beast: b, track: t, isDefault: list!.effective === t.ref });
    }
    return out.sort((a, b) => (b.track.purchaseBlock ?? 0) - (a.track.purchaseBlock ?? 0));
  }, [all, lists]);

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else if (next.size < MAX_BULK_MUSIC_BEASTS) next.add(id);
      return next;
    });

  const selectShown = () =>
    setSelected((prev) => {
      const next = new Set(prev);
      for (const b of shown) {
        if (next.size >= MAX_BULK_MUSIC_BEASTS) break;
        next.add(b.tokenId);
      }
      return next;
    });

  /** Send calls, wait for the tx, then for the API to show each token's change. */
  /**
   * Send calls and wait for the tx. Then either apply the known result
   * locally (`settle`), with no API calls, or poll the API for tokens whose
   * new state we can't know in advance (`reflected`, after buying songs).
   */
  const run = async (
    action: string,
    calls: Call[],
    ids: string[],
    after:
      | { settle: (prev: Record<string, TrackList | null>) => Record<string, TrackList | null> }
      | { reflected: (id: string, m: BeastMusic) => boolean },
    success: string,
  ) => {
    if (!account || calls.length === 0) return;
    setMessage(null);
    setBusy({ action, phase: "wallet" });
    try {
      const res = await account.execute(calls);
      setBusy({ action, phase: "confirming" });
      const outcome = await waitForTx(res.transaction_hash);
      if (outcome === "reverted" || outcome === "rejected") throw new Error(`Transaction ${outcome}.`);
      if ("settle" in after) {
        // The tx succeeded, so the chain now holds exactly what we sent.
        setLists(after.settle);
        ids.forEach(clearTrackSounds);
        setMessage({ tone: "ok", text: success });
      } else {
        setBusy({ action, phase: "indexing" });
        const { reflected } = after;
        const seen = await waitForMany(ids, reflected);
        setLists((prev) => {
          const next = { ...prev };
          for (const [id, m] of seen) next[id] = toList(m);
          return next;
        });
        const lagging = ids.filter((id) => !seen.has(id) || !reflected(id, seen.get(id)!)).length;
        setMessage({ tone: "ok", text: lagging ? `${success} ${lagging} not showing yet; refresh in a moment.` : success });
      }
      fetchSkullBalance(address).then(setSkull).catch(() => {});
    } catch (err) {
      console.error("[my music] transaction failed:", err);
      setMessage({ tone: "error", text: txErrorMessage(err) });
    } finally {
      setBusy(null);
    }
  };

  const setDefaults = (change: { tokenId: string; ref: string }[], action: string) => {
    const want = new Map(change.map((c) => [c.tokenId, c.ref]));
    const calls = change.flatMap((c) => {
      const ref = parseTrackRef(c.ref);
      return ref ? [setDefaultTrackCall(c.tokenId, ref)] : [];
    });
    return run(
      action,
      calls,
      change.map((c) => c.tokenId),
      {
        settle: (prev) => {
          const next = { ...prev };
          for (const [id, ref] of want) {
            const list = next[id];
            if (list) next[id] = { ...list, effective: ref };
          }
          return next;
        },
      },
      `Default track set on ${change.length} beast${change.length === 1 ? "" : "s"}.`,
    );
  };

  const buySongs = () => {
    const before = new Map(chosen.map((b) => [b.tokenId, lists[b.tokenId]?.tracks.length ?? 0]));
    const ids = chosen.map((b) => b.tokenId);
    return run(
      "buy",
      bulkBuyTrackCalls(ids),
      ids,
      { reflected: (id, m) => m.tracks.length > (before.get(id) ?? 0) },
      `Bought ${ids.length} new song${ids.length === 1 ? "" : "s"}. They take a few blocks to compose.`,
    );
  };

  const phase = busy?.phase === "wallet" ? "Confirm in wallet…" : busy?.phase === "confirming" ? "Confirming…" : "Updating…";
  const canTransact = Boolean(account) && !busy;

  if (loadError) {
    return (
      <p className="text-sm text-red-400">
        Couldn&apos;t load your beasts.{" "}
        <button type="button" className="text-gold hover:underline" onClick={() => setReload((r) => r + 1)}>
          Retry
        </button>
      </p>
    );
  }
  if (!beasts) {
    return (
      <div className="flex justify-center py-10">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-gold border-t-transparent" />
      </div>
    );
  }
  if (beasts.length === 0) return <p className="text-sm text-zinc-500">This wallet doesn&apos;t own any beasts yet.</p>;

  const chip = (active: boolean) =>
    cn(
      "rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors",
      active ? "border-gold bg-gold/15 text-gold" : "border-white/10 text-zinc-400 hover:text-white",
    );

  const FILTERS: [Filter, string][] = [
    ["all", "All"],
    ["soundCheck", "Playing Sound Check"],
    ["species", "Playing Species Song"],
    ["named", "Playing Name Song"],
    ["bought", "Playing a bought song"],
    ["kings", "Kings"],
    ["hasBought", "Has bought songs"],
  ];

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="max-w-2xl text-sm text-zinc-400">
            Your beasts and what they play. Select beasts to set one default track on all of them, or buy each a new song,
            in a single transaction. The default track is stored on-chain, so changing it costs a small gas fee.
          </p>
          <button
            type="button"
            onClick={() => setReload((r) => r + 1)}
            disabled={!!busy || listsLoading}
            className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.06] px-3 py-1.5 text-xs text-zinc-400 hover:text-white disabled:opacity-50"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", listsLoading && "animate-spin")} />
            {listsLoading ? `Loading ${loadedCount}/${all.length}` : "Refresh"}
          </button>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {FILTERS.map(([f, label]) => (
            <button key={f} type="button" className={chip(filter === f)} onClick={() => setFilter(f)}>
              {f === "kings" && <Crown className="mr-1 inline h-3 w-3" />}
              {label} <span className="tabular-nums opacity-60">{counts[f]}</span>
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[10rem] flex-1 sm:max-w-xs">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-500" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search your beasts"
              className="w-full rounded-lg border border-white/10 bg-surface/60 py-1.5 pl-8 pr-3 text-sm text-white placeholder:text-zinc-500 focus:border-gold/50 focus:outline-none"
            />
          </div>
          {speciesOptions.length > 1 && (
            <select
              value={species ?? ""}
              onChange={(e) => setSpecies(e.target.value === "" ? null : Number(e.target.value))}
              aria-label="Filter by species"
              className="rounded-lg border border-white/10 bg-surface px-2 py-1.5 text-sm text-zinc-200 focus:border-gold/50 focus:outline-none"
            >
              <option value="">All species</option>
              {speciesOptions.map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      {/* Bulk actions for the selection */}
      <div className="space-y-3 rounded-xl border border-gold/20 bg-gold/[0.03] p-3">
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
          <span className={cn("font-semibold text-zinc-200", atCap && "text-yellow-300")}>
            {selected.size} selected
            {atCap && <span className="font-normal"> (max {MAX_BULK_MUSIC_BEASTS} per transaction)</span>}
          </span>
          <span className="flex gap-3">
            <button type="button" disabled={!!busy || atCap || shown.length === 0} onClick={selectShown} className="text-gold hover:underline disabled:opacity-40">
              Select {shown.length > MAX_BULK_MUSIC_BEASTS - selected.size ? `next ${MAX_BULK_MUSIC_BEASTS - selected.size}` : `all ${shown.length}`} shown
            </button>
            <button type="button" disabled={!!busy || selected.size === 0} onClick={() => setSelected(new Set())} className="text-zinc-400 hover:text-white disabled:opacity-40">
              Clear
            </button>
          </span>
        </div>

        {selected.size === 0 ? (
          <p className="text-[11px] text-zinc-500">Tick beasts below to change their default track or buy them songs.</p>
        ) : (
          <div className="grid gap-3 md:grid-cols-[1fr_auto]">
            <div className="space-y-2">
              <p className="text-[10px] font-bold uppercase tracking-wider text-gold">Set default track</p>
              <div className="flex flex-wrap gap-1.5">
                {options.map((o) => (
                  <button key={o.ref} type="button" disabled={!!busy} onClick={() => setTarget(o.ref)} className={chip(target === o.ref)}>
                    {o.label}
                    {o.count < chosenReady.length && <span className="ml-1 opacity-60">{o.count}/{chosenReady.length}</span>}
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  disabled={!canTransact || !target || plan.change.length === 0}
                  onClick={() => setDefaults(plan.change, "default")}
                  className="inline-flex items-center gap-1.5 rounded-md bg-gold px-3 py-1.5 text-xs font-bold text-black transition-opacity disabled:opacity-40"
                >
                  {busy?.action === "default" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Star className="h-3.5 w-3.5" />}
                  {busy?.action === "default" ? phase : `Set on ${plan.change.length} beast${plan.change.length === 1 ? "" : "s"}`}
                </button>
                {target && (
                  <span className="text-[11px] text-zinc-500">
                    {plan.change.length} will change
                    {plan.already > 0 && ` · ${plan.already} already set`}
                    {plan.missing > 0 && ` · ${plan.missing} don't have it`}
                  </span>
                )}
              </div>
            </div>
            <div className="space-y-2 md:border-l md:border-white/[0.06] md:pl-3">
              <p className="text-[10px] font-bold uppercase tracking-wider text-gold">Buy new songs</p>
              <p className="text-[11px] text-zinc-500">
                1 SKULL each{skull !== null && ` · balance ${formatSkull(skull)}`}
              </p>
              <button
                type="button"
                disabled={!canTransact || shortfall > 0n}
                onClick={buySongs}
                className="inline-flex items-center gap-1.5 rounded-md border border-gold/50 px-3 py-1.5 text-xs font-bold text-gold transition-colors hover:bg-gold/10 disabled:opacity-40"
              >
                {busy?.action === "buy" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ShoppingBag className="h-3.5 w-3.5" />}
                {busy?.action === "buy" ? phase : `Buy ${chosen.length} · ${formatSkull(buyCost)} SKULL`}
              </button>
              {shortfall > 0n && <p className="text-[11px] text-yellow-300">Need {formatSkull(shortfall)} more SKULL.</p>}
            </div>
          </div>
        )}
        {!account && <p className="text-[11px] text-yellow-300">Connect your wallet to make changes.</p>}
        {message && (
          <p className={cn("flex items-center gap-1.5 text-[11px]", message.tone === "ok" ? "text-green-400" : "text-red-400")}>
            {message.tone === "ok" && <CheckCircle2 className="h-3 w-3" />} {message.text}
          </p>
        )}
      </div>

      {/* Beasts */}
      <div className="overflow-x-auto rounded-xl border border-white/[0.06]">
        <table className="w-full min-w-[560px] text-xs">
          <thead className="bg-surface/60 text-left text-[10px] uppercase tracking-wider text-zinc-500">
            <tr>
              <th className="w-8 px-3 py-2" />
              <th className="px-2 py-2">Beast</th>
              <th className="px-2 py-2">Species</th>
              <th className="px-2 py-2">Default track</th>
              <th className="px-2 py-2">Effects</th>
              <th className="px-2 py-2 text-right">Tracks</th>
              <th className="px-2 py-2 text-right">Bought</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.04]">
            {shown.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center text-zinc-500">
                  {listsLoading && filter !== "all" ? "Still loading tracks…" : "No beasts match."}
                </td>
              </tr>
            ) : (
              pageRows.map((b) => {
                const list = lists[b.tokenId];
                const effect = effectOf(b, list);
                const def = list?.tracks.find((t) => t.ref === list.effective);
                const on = selected.has(b.tokenId);
                return (
                  <tr key={b.tokenId} className={cn("hover:bg-white/[0.02]", on && "bg-gold/[0.04]")}>
                    <td className="px-3 py-1.5">
                      <input
                        type="checkbox"
                        checked={on}
                        disabled={!!busy || (!on && atCap)}
                        onChange={() => toggle(b.tokenId)}
                        aria-label={`Select ${b.name}`}
                        className="h-3.5 w-3.5 rounded border-white/[0.08] bg-white/[0.06] text-gold"
                      />
                    </td>
                    <td className="max-w-[14rem] px-2 py-1.5">
                      <button type="button" onClick={() => player.open(b)} className="flex max-w-full items-center gap-1 text-left text-zinc-200 hover:text-gold hover:underline">
                        {isKing(b) && <Crown className="h-3 w-3 shrink-0 text-gold" aria-label="King" />}
                        <span className="truncate">{b.name}</span>
                      </button>
                    </td>
                    <td className="px-2 py-1.5 text-zinc-400">{speciesName(b)}</td>
                    <td className="px-2 py-1.5">
                      {list === undefined ? (
                        <span className="text-zinc-600">…</span>
                      ) : !list || !def ? (
                        <span className="text-zinc-600">—</span>
                      ) : (
                        <PlayButton
                          player={player}
                          label={def.label}
                          className="flex-none justify-start px-2 py-1"
                          item={{
                            key: `mine:${b.tokenId}:${def.ref}`,
                            beast: b,
                            track: def.ref,
                            title: `${b.name} · ${def.label}`,
                            subtitle: "Default track",
                          }}
                        />
                      )}
                    </td>
                    <td className="px-2 py-1.5">
                      {effect == null ? (
                        <span className="text-zinc-600">{list === undefined ? "…" : "—"}</span>
                      ) : effect.preset == null || !EFFECT_NAMES[effect.preset] ? (
                        <span className="text-zinc-600">…</span>
                      ) : (
                        <span
                          title={`${EFFECT_TITLES[effect.preset]}. ${effect.source}.`}
                          className={cn(
                            "whitespace-nowrap rounded-full border px-1.5 py-0.5 text-[10px] font-semibold",
                            effect.preset > 0 ? "border-gold/40 bg-gold/10 text-gold" : "border-white/10 bg-white/[0.04] text-zinc-400",
                          )}
                        >
                          {EFFECT_NAMES[effect.preset]}
                        </span>
                      )}
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums text-zinc-400">{list?.tracks.length ?? ""}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums text-zinc-400">{list ? list.tracks.filter(isBought).length || "" : ""}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      <Pager page={page} pages={Math.ceil(shown.length / PAGE_SIZE)} onPage={setPage} />

      {/* Bought songs */}
      <section className="space-y-3">
        <h3 className="flex items-center gap-2 text-base font-bold text-white">
          <ShoppingBag className="h-4 w-4 text-gold" /> Your bought songs
          <span className="rounded bg-white/[0.06] px-1.5 text-xs text-zinc-300">{bought.length}</span>
        </h3>
        {bought.length === 0 ? (
          <p className="text-sm text-zinc-500">{listsLoading ? "Loading…" : "None of your beasts have bought songs yet."}</p>
        ) : (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {bought.slice(boughtPage * PAGE_SIZE, (boughtPage + 1) * PAGE_SIZE).map(({ beast, track, isDefault }) => {
              const ready = track.status === "ready";
              const key = `${beast.tokenId}:${track.ref}`;
              return (
                <div key={key} className="flex flex-col gap-2 rounded-lg border border-white/[0.06] bg-surface/60 p-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <button type="button" onClick={() => player.open(beast)} className="block max-w-full truncate text-left text-sm font-semibold text-zinc-200 hover:text-gold hover:underline">
                        {beast.name}
                      </button>
                      <p className="text-[11px] text-zinc-500">
                        {track.label}
                        {!ready && " · Composing…"}
                      </p>
                    </div>
                    {isDefault && (
                      <span className="shrink-0 rounded-full border border-gold/40 bg-gold/10 px-1.5 py-0.5 text-[9px] font-semibold text-gold">
                        <Star className="mr-0.5 inline h-2.5 w-2.5" /> Default
                      </span>
                    )}
                  </div>
                  <div className="flex gap-1.5">
                    <PlayButton
                      player={player}
                      label="Play"
                      item={{ key: `mine:${key}`, beast, track: track.ref, title: `${beast.name} · ${track.label}`, subtitle: "Bought song" }}
                    />
                    {!isDefault && (
                      <button
                        type="button"
                        disabled={!canTransact || !ready}
                        title={ready ? "Make this the beast's default track" : "Can be set once it's composed"}
                        onClick={() => setDefaults([{ tokenId: beast.tokenId, ref: track.ref }], key)}
                        className="flex flex-1 items-center justify-center gap-1.5 rounded-md border border-white/10 px-2 py-1.5 text-[11px] font-semibold text-zinc-300 transition-colors hover:border-gold/50 hover:text-gold disabled:opacity-40"
                      >
                        {busy?.action === key ? <Loader2 className="h-3 w-3 animate-spin" /> : <Star className="h-3 w-3" />}
                        {busy?.action === key ? phase : "Set as default"}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
        <Pager page={boughtPage} pages={Math.ceil(bought.length / PAGE_SIZE)} onPage={setBoughtPage} />
      </section>
    </div>
  );
}

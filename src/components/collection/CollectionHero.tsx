import type { Beast } from "../../services/beast";
import type { BeastCollectionStats } from "../../utils/beastCollection";
import { getBeastRank, unrankedReason, UNRANKED_LABELS } from "../../utils/beast";
import { useSpeciesCount } from "../../hooks/useBeastQueries";
import { gradeBuckets } from "../../utils/gradeFilter";

/** A headline number in the hero (beasts, combined power/health, summit rank). */
export type OverviewCard = {
  key: string;
  icon: string;
  label: string;
  /** shown on phones instead of `label` */
  shortLabel?: string;
  value: string;
  sub?: string;
};

type CollectionHeroProps = {
  stats: BeastCollectionStats;
  /** Headline numbers (beasts, combined power/health, summit rank) */
  overviewCards: OverviewCard[];
  onSelectBeast?: (beast: Beast) => void;
  /** The owner's beasts, for the card-grade counts (omitted: no grade row). */
  beasts?: Beast[];
};

const pct = (n: number, total: number) => (total > 0 ? Math.min(100, Math.round((n / total) * 100)) : 0);

/** `"Loath Instrument" Leviathan` -> { title: "Loath Instrument", species: "Leviathan" } */
function splitBeastName(name: string | null | undefined): { title: string | null; species: string } {
  const trimmed = (name ?? "").trim();
  const m = trimmed.match(/^"([^"]+)"\s+(.+)$/);
  return m ? { title: m[1], species: m[2] } : { title: null, species: trimmed };
}

/** What the rarity score is made of: visual, card grade and species rank. */
function rarityStat(beast: Beast): string | null {
  const rank = getBeastRank(beast);
  const parts = [
    beast.visual && beast.visual !== "Regular" ? `✨ ${beast.visual}` : null,
    beast.cardGrade != null ? `💎 Grade ${beast.cardGrade}` : null,
    // rank 0: Genesis / New / Unranked
    rank != null && rank > 0 ? `👑 #${rank}` : UNRANKED_LABELS[unrankedReason(beast) ?? "unranked"],
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : null;
}

function ProgressBar({ value, total, color }: { value: number; total: number; color: string }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/[0.06]" role="presentation">
      <div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${pct(value, total)}%`, background: color }} />
    </div>
  );
}

const panel = "rounded-xl border border-white/[0.06] bg-surface-raised/70";
const eyebrow = "text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-500";

/**
 * Collection page hero: species progress + headline numbers, then the variant
 * breakdown and the collection's highlight beasts.
 */
export function CollectionHero({ stats, overviewCards, onSelectBeast, beasts }: CollectionHeroProps) {
  const totalSpecies = useSpeciesCount();
  const complete = stats.uniqueBeastTypes >= totalSpecies && totalSpecies > 0;

  const variants = [
    { key: "standard", label: "Standard", count: stats.standardCount, unique: stats.uniqueStandardTypes, color: "#22c55e" },
    { key: "shiny", label: "Shiny", count: stats.shinyCount, unique: stats.uniqueShinyTypes, color: "#fde047" },
    { key: "animated", label: "MIDI", count: stats.animatedCount, unique: stats.uniqueAnimatedTypes, color: "#7dd3fc" },
    {
      key: "animatedShiny",
      label: "Shiny MIDI",
      count: stats.animatedShinyCount,
      unique: stats.uniqueAnimatedShinyTypes,
      color: "linear-gradient(90deg, #ec4899, #a855f7, #38bdf8)",
      dot: "#ec4899",
    },
  ];

  const grades = beasts && beasts.length > 0 ? gradeBuckets(beasts) : null;
  const gradeCells = grades
    ? [
        { key: "g10", label: "Grade 10", value: grades.g10, accent: "text-[#e2b94c]", color: "linear-gradient(90deg, #b8941f, #e2b94c)", title: "Perfect condition" },
        { key: "g9", label: "Grade 9", value: grades.g9, accent: "text-white", color: "#a1a1aa" },
        { key: "g8", label: "Grade 8", value: grades.g8, accent: "text-white", color: "#71717a" },
        { key: "g7", label: "Grade 7–0", value: grades.g7AndBelow, accent: "text-zinc-300", color: "#52525b", title: "Grade 7 or lower" },
      ]
    : [];
  const gradedTotal = grades ? grades.g10 + grades.g9 + grades.g8 + grades.g7AndBelow : 0;

  // Rank 0 means "unranked" in the data, not first place
  const rawRank = getBeastRank(stats.highestRanked);
  const highestRank = rawRank != null && rawRank > 0 ? rawRank : null;
  const highlights: Array<{ key: string; label: string; beast: Beast | null; name?: string | null; stat?: string | null; accent: string }> = [
    {
      key: "mostPowerful",
      label: "Most Powerful",
      beast: stats.mostPowerful,
      stat: stats.mostPowerful?.power != null ? `⚡ ${stats.mostPowerful.power.toLocaleString()} power` : null,
      accent: "text-red-300",
    },
    {
      key: "highestRanked",
      label: "Highest Rank",
      beast: stats.highestRanked,
      stat: highestRank != null ? `👑 Rank #${highestRank}` : null,
      accent: "text-gold",
    },
    {
      key: "rarest",
      label: "Rarest",
      beast: stats.rarest,
      // combined rank + card grade + visual score (see fetchOwnerBeastHighlights)
      stat: stats.rarest ? rarityStat(stats.rarest) : null,
      accent: "text-purple-300",
    },
    {
      key: "lastCollected",
      label: "Last Collected",
      beast: stats.lastBeastKilled,
      name: stats.lastBeastKilledName,
      accent: "text-sky-300",
    },
  ];

  return (
    <section className="flex flex-col gap-3" aria-label="Collection overview">
      {/* Species progress + headline numbers */}
      <div className={`${panel} grid gap-4 p-4 sm:p-5 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,2fr)] lg:items-center`}>
        <div className="space-y-2">
          <p className={eyebrow}>Species collected</p>
          <p className="flex items-baseline gap-1.5">
            <span className={`text-3xl font-bold leading-none ${complete ? "text-[#39ff14]" : "text-white"}`}>
              {stats.uniqueBeastTypes}
            </span>
            <span className="text-sm text-zinc-500">/ {totalSpecies}</span>
            <span className="ml-auto text-xs font-semibold text-zinc-400">{pct(stats.uniqueBeastTypes, totalSpecies)}%</span>
          </p>
          <ProgressBar value={stats.uniqueBeastTypes} total={totalSpecies} color="linear-gradient(90deg, #b8941f, #e2b94c)" />
        </div>
        <dl
          className={`grid gap-3 border-t border-white/[0.06] pt-4 lg:border-l lg:border-t-0 lg:pl-5 lg:pt-0 ${
            overviewCards.length >= 4 ? "grid-cols-2 sm:grid-cols-4" : "grid-cols-3"
          }`}
        >
          {overviewCards.map((card) => (
            <div key={card.key} className="min-w-0">
              <dt className={`${eyebrow} truncate`} title={card.label}>
                <span className="mr-1" aria-hidden>
                  {card.icon}
                </span>
                {card.shortLabel ? (
                  <>
                    <span className="sm:hidden">{card.shortLabel}</span>
                    <span className="hidden sm:inline">{card.label}</span>
                  </>
                ) : (
                  card.label
                )}
              </dt>
              <dd className="mt-1 flex items-baseline gap-1">
                <span className="text-xl font-bold leading-none text-white sm:text-2xl">{card.value}</span>
                {card.sub && <span className="text-[11px] text-zinc-500">{card.sub}</span>}
              </dd>
            </div>
          ))}
        </dl>
      </div>

      <div
        className={`grid gap-3 ${
          gradeCells.length > 0
            ? "sm:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] xl:grid-cols-[minmax(0,4fr)_minmax(0,3fr)_minmax(0,6fr)]"
            : "lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]"
        }`}
      >
        {/* Variant breakdown */}
        <div className={`${panel} p-4 sm:p-5`}>
          <p className={`${eyebrow} mb-3`}>Variants</p>
          <ul className="space-y-3">
            {variants.map((v) => (
              <li key={v.key} className="space-y-1.5">
                <div className="flex items-center gap-2 text-sm">
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: v.dot ?? v.color }} aria-hidden />
                  <span className="font-medium text-zinc-200">{v.label}</span>
                  <span className="ml-auto font-bold text-white">{v.count.toLocaleString()}</span>
                  <span
                    className={`w-16 text-right text-[11px] ${
                      v.unique >= totalSpecies && totalSpecies > 0 ? "font-semibold text-[#39ff14]" : "text-zinc-500"
                    }`}
                    title={`${v.unique} of ${totalSpecies} species`}
                  >
                    {v.unique}/{totalSpecies}
                  </span>
                </div>
                <ProgressBar value={v.unique} total={totalSpecies} color={v.color} />
              </li>
            ))}
          </ul>
        </div>

        {/* Card grades */}
        {gradeCells.length > 0 && (
          <div className={`${panel} p-4 sm:p-5`}>
            <p className={`${eyebrow} mb-3`}>Card grades</p>
            <ul className="space-y-3">
              {gradeCells.map((g) => (
                <li key={g.key} className="space-y-1.5" title={g.title}>
                  <div className="flex items-center gap-2 text-sm">
                    <span className="font-medium text-zinc-200">{g.label}</span>
                    <span className={`ml-auto font-bold tabular-nums ${g.accent}`}>{g.value.toLocaleString()}</span>
                  </div>
                  <ProgressBar value={g.value} total={gradedTotal} color={g.color} />
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Highlights */}
        <div className={`${panel} p-4 sm:p-5 ${gradeCells.length > 0 ? "sm:col-span-2 xl:col-span-1" : ""}`}>
          <p className={`${eyebrow} mb-3`}>Highlights</p>
          <div className="grid grid-cols-2 gap-2">
            {highlights.map((h) => {
              const { title, species } = splitBeastName(h.name ?? h.beast?.name);
              const clickable = Boolean(h.beast && onSelectBeast);
              const body = (
                <>
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-black/60 sm:h-12 sm:w-12">
                    {h.beast?.image ? (
                      <img
                        src={h.beast.image}
                        alt=""
                        className="h-9 w-9 object-contain sm:h-11 sm:w-11"
                        style={{ imageRendering: "pixelated" }}
                        loading="lazy"
                      />
                    ) : (
                      <span className="text-lg text-zinc-700" aria-hidden>
                        ?
                      </span>
                    )}
                  </div>
                  <div className="w-full min-w-0 flex-1 text-left">
                    <p className={eyebrow}>{h.label}</p>
                    {species ? (
                      <>
                        <p className={`truncate text-sm font-bold leading-tight ${h.accent}`} title={h.name ?? h.beast?.name}>
                          {species}
                        </p>
                        {/* phones: title and stat on their own lines; wider: one line */}
                        <p className="truncate text-[11px] text-zinc-400 sm:hidden">{title ? `“${title}”` : " "}</p>
                        {h.stat && <p className="truncate text-[11px] text-zinc-500 sm:hidden">{h.stat}</p>}
                        <p className="hidden truncate text-[11px] text-zinc-400 sm:block">
                          {[title && `“${title}”`, h.stat].filter(Boolean).join(" · ") || " "}
                        </p>
                      </>
                    ) : (
                      <p className="text-sm font-semibold text-zinc-600">None</p>
                    )}
                  </div>
                </>
              );
              return clickable ? (
                <button
                  key={h.key}
                  type="button"
                  onClick={() => h.beast && onSelectBeast?.(h.beast)}
                  className="flex min-w-0 flex-col items-start gap-2 rounded-lg border border-white/[0.04] bg-white/[0.02] p-2.5 transition-colors hover:border-white/[0.12] hover:bg-white/[0.05] sm:flex-row sm:items-center sm:gap-3"
                >
                  {body}
                </button>
              ) : (
                <div key={h.key} className="flex min-w-0 flex-col items-start gap-2 rounded-lg border border-white/[0.04] bg-white/[0.02] p-2.5 sm:flex-row sm:items-center sm:gap-3">
                  {body}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}

export default CollectionHero;

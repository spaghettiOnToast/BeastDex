import { Loader2 } from "lucide-react";
import {
  GEAR_SLOTS,
  itemGreatness,
  itemImageUrl,
  itemName,
  itemTier,
  itemSpecials,
  specialItemName,
  type AdventurerGear,
  type GearItem,
} from "../../services/adventurers";

const STAT_LABELS: Array<[keyof AdventurerGear["stats"], string]> = [
  ["strength", "STR"],
  ["dexterity", "DEX"],
  ["vitality", "VIT"],
  ["intelligence", "INT"],
  ["wisdom", "WIS"],
  ["charisma", "CHA"],
  ["luck", "LUK"],
];

/** Tier colours: T1 gold → T5 grey. */
const TIER_COLOR = ["#a1a1aa", "#facc15", "#c084fc", "#60a5fa", "#4ade80", "#a1a1aa"];

function ItemRow({ slot, item, salt }: { slot: string; item?: GearItem; salt: number }) {
  if (!item) {
    return (
      <div className="flex items-center gap-1.5 text-zinc-600">
        <span className="h-5 w-5 flex-shrink-0 rounded bg-white/[0.04]" />
        <span className="truncate">{slot}: empty</span>
      </div>
    );
  }
  const tier = itemTier(item.id);
  const greatness = itemGreatness(item.xp);
  const specials = itemSpecials(item.id, greatness, salt);
  const special = [specials.prefix, specials.suffix].filter(Boolean).join(" · ");
  return (
    <div
      className="flex items-center gap-1.5"
      title={`${slot}: ${specialItemName(itemName(item.id), specials)} · Tier ${tier} · Greatness ${greatness} (${item.xp} XP)`}
    >
      <img
        src={itemImageUrl(item.id)}
        alt=""
        loading="lazy"
        className="h-5 w-5 flex-shrink-0 rounded bg-black/40 object-contain"
        onError={(e) => (e.currentTarget.style.visibility = "hidden")}
      />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-zinc-200">{itemName(item.id)}</span>
        {special && <span className="block truncate text-[9px] text-gold/80">{special}</span>}
      </span>
      <span className="flex-shrink-0 font-mono" style={{ color: TIER_COLOR[tier] }}>
        T{tier}
      </span>
      <span className="w-6 flex-shrink-0 text-right font-mono text-zinc-400">G{greatness}</span>
    </div>
  );
}

/** Equipped gear, stats and bag for one adventurer (shown over the card on hover). */
export function GearPanel({ gear, loading }: { gear?: AdventurerGear; loading: boolean }) {
  if (!gear) {
    return (
      <div className="flex h-full items-center justify-center gap-2 text-[11px] text-zinc-400">
        {loading ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" /> Loading gear…
          </>
        ) : (
          "Gear unavailable"
        )}
      </div>
    );
  }
  return (
    <div className="flex h-full flex-col gap-1.5 overflow-y-auto p-2 text-[10px] leading-tight">
      <div className="text-[9px] font-bold uppercase tracking-wider text-zinc-500">Equipped</div>
      <div className="space-y-1">
        {GEAR_SLOTS.map((slot) => (
          <ItemRow key={slot} slot={slot} item={gear.equipment[slot]} salt={gear.specialsSalt} />
        ))}
      </div>
      <div className="grid grid-cols-7 gap-0.5 border-t border-white/10 pt-1.5 text-center">
        {STAT_LABELS.map(([key, label]) => (
          <div key={key}>
            <div className="text-[8px] text-zinc-500">{label}</div>
            <div className="font-bold text-zinc-200">{gear.stats[key]}</div>
          </div>
        ))}
      </div>
      {gear.statUpgrades > 0 && <div className="text-amber-300">{gear.statUpgrades} stat upgrade(s) unspent</div>}
      {gear.bag.length > 0 && (
        <div className="border-t border-white/10 pt-1.5">
          <div className="mb-0.5 text-[9px] font-bold uppercase tracking-wider text-zinc-500">Bag ({gear.bag.length})</div>
          <div className="text-zinc-300">
            {gear.bag
              .map((i) => `${specialItemName(itemName(i.id), itemSpecials(i.id, itemGreatness(i.xp), gear.specialsSalt))} T${itemTier(i.id)}`)
              .join(" · ")}
          </div>
        </div>
      )}
    </div>
  );
}

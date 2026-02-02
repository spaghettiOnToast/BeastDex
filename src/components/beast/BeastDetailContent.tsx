import { type ReactNode } from "react";
import { Link } from "react-router-dom";
import type { Beast, BeastAttribute } from "../../services/beast";
import type { SummitBeastData } from "../../services/summit";
import CometCard from "../ui/CometCard";
import SummitStats from "./SummitStats";

type BeastDetailContentProps = {
  beast: Beast;
  ownerUsername?: string | null;
  actionSlot?: ReactNode;
  imageSize?: "modal" | "detail";
  summitData?: SummitBeastData | null;
  summitLoading?: boolean;
};

const BOOLEAN_ATTRIBUTES = new Set(["shiny", "animated", "genesis"]);
const UNIX_TIMESTAMP_ATTRIBUTES = new Set(["last death timestamp"]);

export function BeastDetailContent({
  beast,
  ownerUsername,
  actionSlot,
  imageSize = "detail",
  summitData,
  summitLoading,
}: BeastDetailContentProps) {
  const attributes = Array.isArray(beast.attributes) ? beast.attributes : [];

  const ownerAddressLower = beast.owner ? beast.owner.toLowerCase() : "";
  const accountIdentifier = ownerUsername
    ? ownerUsername.trim().toLowerCase()
    : ownerAddressLower;

  const ownerLabel = ownerUsername
    ? ownerUsername
    : beast.owner
    ? `${beast.owner.slice(0, 6)}…${beast.owner.slice(-4)}`
    : "";

  const formatAttributeValue = (
    trait: string | undefined,
    value: BeastAttribute["value"]
  ) => {
    if (!trait) return String(value);
    const t = trait.toLowerCase();

    if (BOOLEAN_ATTRIBUTES.has(t)) {
      if (value === "1" || value === 1) return "Yes";
      if (value === "0" || value === 0) return "No";
    }

    if (UNIX_TIMESTAMP_ATTRIBUTES.has(t)) {
      const n = typeof value === "number" ? value : Number(value);
      if (Number.isFinite(n) && n > 0) {
        const d = new Date(n * 1000);
        if (!Number.isNaN(d.getTime())) return d.toLocaleString();
      }
    }

    return String(value);
  };

  const imageClasses =
    imageSize === "detail"
      ? "block h-[30rem] w-auto max-w-[520px] object-contain sm:h-[32rem]"
      : "block h-[32rem] w-auto object-contain";

  const fallbackBoxClasses =
    imageSize === "detail"
      ? "flex h-[30rem] w-[520px] items-center justify-center bg-black/70 px-6 text-gray-600 sm:h-[32rem]"
      : "flex h-[32rem] w-72 items-center justify-center bg-black/70 px-6 text-gray-600";

  const summitStatsHeightClasses =
    imageSize === "detail"
      ? "h-[30rem] sm:h-[32rem]"
      : "h-[32rem]";

  return (
    <div className="space-y-6">
      {/* Top row: Image + Summit Stats */}
      <div className="grid gap-4 md:grid-cols-5">
        <div className="md:col-span-3 flex flex-col items-center gap-3">
          <CometCard>
            {beast.image ? (
              <img src={beast.image} alt={beast.name} className={imageClasses} />
            ) : (
              <div className={fallbackBoxClasses}>No image available</div>
            )}
          </CometCard>
        </div>

        <div className="md:col-span-2 flex w-full flex-col gap-3">
          {/* Summit Stats - static card with glow */}
          <div className={`relative ${summitStatsHeightClasses}`}>
            <div className="absolute inset-0 overflow-hidden rounded-2xl bg-black/60">
              <span className="pointer-events-none absolute left-1/2 top-1/2 h-56 w-56 -translate-x-1/2 -translate-y-1/2 rounded-full bg-gradient-to-br from-[#39ff14]/60 via-transparent to-transparent blur-3xl" />
            </div>
            <div className="relative z-10 h-full rounded-2xl border border-gray-800 bg-black/80 shadow-[0_20px_45px_-20px_rgba(57,255,20,0.45)]">
              <SummitStats
                beast={beast}
                summitData={summitData ?? null}
                loading={summitLoading}
                size={imageSize}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Bottom row: Owned by + Actions */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        {/* Owned by - compact */}
        <section className="rounded-lg border border-gray-800 bg-black/40 px-4 py-2 text-xs text-gray-400">
          {beast.owner ? (
            <span>
              Owned by{" "}
              <Link
                to={`/collection/${encodeURIComponent(accountIdentifier)}`}
                className="text-lsGold hover:underline"
              >
                {ownerLabel}
              </Link>
            </span>
          ) : (
            <span>Not owned</span>
          )}
        </section>

        {/* Actions - right aligned */}
        {actionSlot && <div>{actionSlot}</div>}
      </div>

      {/* Bottom row: NFT Metadata */}
      <section className="rounded-xl border border-gray-800 bg-black/40 p-4">
        <h2 className="mb-3 text-sm font-semibold text-lsGold uppercase tracking-wide">
          NFT Metadata
        </h2>
        {attributes.length > 0 ? (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
            {attributes.map((attr, idx) => (
              <div
                key={`${attr.trait_type}-${attr.value}-${idx}`}
                className="rounded-md border border-gray-800 bg-black/50 px-2 py-1.5"
              >
                <p className="text-[9px] uppercase tracking-wide text-gray-500">
                  {attr.trait_type}
                </p>
                <p className="truncate text-[12px] text-gray-200">
                  {formatAttributeValue(attr.trait_type, attr.value)}
                </p>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-gray-500">
            No metadata attributes available for this beast.
          </p>
        )}
      </section>
    </div>
  );
}

export default BeastDetailContent;

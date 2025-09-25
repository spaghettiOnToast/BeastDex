import { type ReactNode } from "react";
import { Link } from "react-router-dom";
import type { Beast, BeastAttribute } from "../../services/beast";
import CometCard from "../ui/CometCard";

type BeastDetailContentProps = {
  beast: Beast;
  ownerUsername?: string | null;
  actionSlot?: ReactNode;
  imageSize?: "modal" | "detail";
};

const BOOLEAN_ATTRIBUTES = new Set(["shiny", "animated", "genesis"]);
const UNIX_TIMESTAMP_ATTRIBUTES = new Set(["last death timestamp"]);

export function BeastDetailContent({
  beast,
  ownerUsername,
  actionSlot,
  imageSize = "detail",
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
      : "block max-h-[28rem] w-auto object-contain align-top";

  const fallbackBoxClasses =
    imageSize === "detail"
      ? "flex h-[30rem] w-[520px] items-center justify-center bg-black/70 px-6 text-gray-600 sm:h-[32rem]"
      : "flex h-72 w-72 items-center justify-center bg-black/70 px-6 text-gray-600";

  return (
    <div className="grid gap-6 md:grid-cols-5">
      <div className="md:col-span-3 flex items-start justify-center">
        <CometCard>
          {beast.image ? (
            <img src={beast.image} alt={beast.name} className={imageClasses} />
          ) : (
            <div className={fallbackBoxClasses}>No image available</div>
          )}
        </CometCard>
      </div>

      <div className="md:col-span-2 flex w-full flex-col gap-3">
        <section className="rounded-xl border border-gray-800 bg-black/40 p-4">
          <h2 className="mb-3 text-sm font-semibold text-lsGold uppercase tracking-wide">
            Attributes
          </h2>
          {attributes.length > 0 ? (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
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

        {/* Owned by */}
        <section className="rounded-xl border border-gray-800 bg-black/40 p-4 text-xs text-gray-400">
          {beast.owner ? (
            <p>
              Owned by{" "}
              <Link
                to={`/account/${encodeURIComponent(accountIdentifier)}`}
                className="text-lsGold hover:underline"
              >
                {ownerLabel}
              </Link>
            </p>
          ) : (
            <p>Not owned</p>
          )}
        </section>

        {actionSlot ? <div>{actionSlot}</div> : null}
      </div>
    </div>
  );
}

export default BeastDetailContent;

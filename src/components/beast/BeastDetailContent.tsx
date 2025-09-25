import { type ReactNode } from "react";
import { Link } from "react-router-dom";
import type { Beast } from "../../services/beast";
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
  imageSize = "modal",
}: BeastDetailContentProps) {
  const attributes = Array.isArray(beast.attributes)
    ? beast.attributes
    : [];

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
    value: BeastAttribute["value"],
  ) => {
    if (!trait) return String(value);

    const normalisedTrait = trait.toLowerCase();
    if (BOOLEAN_ATTRIBUTES.has(normalisedTrait)) {
      if (value === "1" || value === 1) {
        return "Yes";
      }
      if (value === "0" || value === 0) {
        return "No";
      }
    }

    if (UNIX_TIMESTAMP_ATTRIBUTES.has(normalisedTrait)) {
      const numeric = typeof value === "number" ? value : Number(value);
      if (Number.isFinite(numeric) && numeric > 0) {
        const date = new Date(numeric * 1000);
        if (!Number.isNaN(date.getTime())) {
          return date.toLocaleString();
        }
      }
    }

    return String(value);
  };

  const imageWrapperClasses =
    imageSize === "detail"
      ? "items-center justify-center overflow-hidden rounded-2xl"
      : "items-center justify-center overflow-hidden rounded-2xl";

  const cardClassName =
    imageSize === "detail" ? "inline-block" : "inline-block align-top";

  const fallbackBoxClasses =
    imageSize === "detail"
      ? "flex h-[32rem] w-[520px] items-center justify-center bg-black/70 px-6 text-gray-600 sm:h-[34rem]"
      : "flex h-72 w-72 items-center justify-center bg-black/70 px-6 text-gray-600";

  const imageClasses =
    imageSize === "detail"
      ? "block h-[32rem] w-auto max-w-[520px] object-contain sm:h-[34rem]"
      : "block max-h-[28rem] w-auto object-contain align-top";

  return (
    <div className="grid gap-6 md:grid-cols-5">
      <div className="md:col-span-3 flex flex-col items-center gap-4">
        <CometCard className={cardClassName}>
          <div
            className={`${
              imageSize === "detail"
                ? "inline-flex h-[32rem] w-auto max-w-[520px] sm:h-[34rem]"
                : "inline-flex"
            } ${imageWrapperClasses}`.trim()}
          >
            {beast.image ? (
              <img
                src={beast.image}
                alt={beast.name}
                className={imageClasses}
              />
            ) : (
              <div className={fallbackBoxClasses}>
                No image available
              </div>
            )}
          </div>
        </CometCard>
        <div className="w-full text-center text-xs text-gray-400 md:text-left">
          <p>
            {beast.owner ? (
              <>
                Owned by{" "}
                <Link
                  to={`/account/${encodeURIComponent(accountIdentifier)}`}
                  className="text-lsGold hover:underline"
                >
                  {ownerLabel}
                </Link>
              </>
            ) : (
              "Not owned"
            )}
          </p>
        </div>
      </div>
      <div className="md:col-span-2 flex w-full flex-col gap-3">
        {attributes.length > 0 ? (
          <div className="grid grid-cols-2 gap-2 lg:grid-cols-3">
            {attributes.map((attr, idx) => (
              <div
                key={`${attr.trait_type}-${attr.value}-${idx}`}
                className="rounded-md border border-gray-800 bg-black/40 px-2 py-1.5"
              >
                <p className="text-[8px] uppercase tracking-[0.18em] text-gray-500">
                  {attr.trait_type}
                </p>
                <p className="truncate text-[11px] text-gray-200">
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
        {actionSlot ? <div className="pt-2">{actionSlot}</div> : null}
      </div>
    </div>
  );
}

export default BeastDetailContent;

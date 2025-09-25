import { memo } from "react";
import { Link } from "react-router-dom";
import type { Beast } from "../services/beast";
import { LazyImage } from "./ui/LazyImage";

type Props = {
  beast: Beast;
  owned?: boolean;
  ownerUsername?: string | null;
  onSelect?: (beast: Beast) => void;
  missing?: boolean;
  overlayLabel?: string;
  disabled?: boolean;
};

const BeastCard = memo(function BeastCard({
  beast,
  owned,
  ownerUsername,
  onSelect,
  missing = false,
  overlayLabel = "Need to hunt",
  disabled = false,
}: Props) {
  const { image, name, owner } = beast;

  const renderOwner = () => {
    if (missing) {
      return <span>{overlayLabel}</span>;
    }

    if (!owned || !owner) {
      return <span>Not Owned</span>;
    }

    const address = owner.toLowerCase();
    const label = ownerUsername
      ? ownerUsername
      : `${owner.slice(0, 6)}…${owner.slice(-4)}`;
    const accountIdentifier = ownerUsername
      ? ownerUsername.trim().toLowerCase()
      : address;

    return (
      <span>
        Owned by{" "}
        <Link
          to={`/account/${encodeURIComponent(accountIdentifier)}`}
          className="text-lsGold hover:underline"
          onClick={(event) => event.stopPropagation()}
        >
          {label}
        </Link>
      </span>
    );
  };

  return (
    <button
      type="button"
      onClick={() => {
        if (!disabled && !missing) {
          onSelect?.(beast);
        }
      }}
      disabled={disabled || missing}
      className="w-56 flex flex-col items-center focus:outline-none"
    >
      <div className={`relative bg-black rounded-lg overflow-hidden shadow-lg w-full h-80 border border-gray-800 transition ${missing ? "border-dashed border-gray-700" : "hover:border-lsGreen"}`}>
        {image ? (
          <LazyImage
            src={image}
            alt={name}
            className="object-contain w-full h-full"
            placeholder="No image"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-gray-600 text-sm">
            No image
          </div>
        )}
        {missing ? (
          <div className="absolute inset-0 flex items-center justify-center bg-black/70">
            <span className="rounded-full border border-lsGold/40 bg-black/60 px-3 py-1 text-xs uppercase tracking-widest text-gray-200">
              {overlayLabel}
            </span>
          </div>
        ) : null}
      </div>
      <div className="mt-2 text-center">
        <p className="font-bold text-lsGold text-sm truncate">{name}</p>
        <p className="text-xs text-gray-400">{renderOwner()}</p>
      </div>
    </button>
  );
});

export default BeastCard;

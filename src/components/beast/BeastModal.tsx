import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import type { Beast } from "../../services/beast";
import BeastDetailContent from "./BeastDetailContent";

type BeastModalProps = {
  beast: Beast | null;
  ownerUsernames: Record<string, string | undefined>;
  onClose: () => void;
};

export function BeastModal({ beast, ownerUsernames, onClose }: BeastModalProps) {
  const navigate = useNavigate();

  useEffect(() => {
    if (!beast) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [beast, onClose]);

  if (!beast) {
    return null;
  }

  const ownerUsername = beast.owner
    ? ownerUsernames[beast.owner.toLowerCase()] ?? null
    : null;

  const detailPath = Number.isFinite(beast.numericId) && beast.numericId > 0
    ? `/beasts/${beast.numericId}`
    : `/beasts/${encodeURIComponent(beast.id)}`;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 md:p-10">
      <div className="absolute inset-0 bg-black/80" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        className="relative z-10 w-full max-w-5xl overflow-hidden rounded-2xl border border-gray-800 bg-[#0b0b0f] shadow-[0_0_40px_rgba(57,255,20,0.2)]"
      >
        <div className="flex items-center justify-between border-b border-gray-800 px-6 py-4">
          <h2 className="text-lg font-semibold text-lsGold">{beast.name}</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-gray-300 hover:bg-gray-900"
            aria-label="Close beast details"
          >
            ✕
          </button>
        </div>
        <div className="max-h-[80vh] overflow-y-auto px-6 py-6">
          <BeastDetailContent
            beast={beast}
            ownerUsername={ownerUsername}
            actionSlot={
              <button
                type="button"
                onClick={() => {
                  onClose();
                  navigate(detailPath);
                }}
                className="inline-flex items-center justify-center rounded-md border border-lsGold px-4 py-2 text-xs font-semibold uppercase tracking-wide text-lsGold transition hover:bg-gray-900"
              >
                View Full Details
              </button>
            }
          />
        </div>
      </div>
    </div>
  );
}

export default BeastModal;

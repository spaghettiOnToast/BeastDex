import { cn } from "../../../lib/utils";
import type { MarketplaceView } from "../types";

interface ViewToggleProps {
  value: MarketplaceView;
  onChange: (value: MarketplaceView) => void;
}

/**
 * Toggle component for switching between Explore and My Activity views
 */
export function ViewToggle({ value, onChange }: ViewToggleProps) {
  const options: Array<{
    value: MarketplaceView;
    label: string;
    description: string;
  }> = [
    {
      value: "explore",
      label: "Explore Listings",
      description: "Browse and purchase beasts from other users.",
    },
    {
      value: "my",
      label: "My Activity",
      description: "Manage your beasts and live listings.",
    },
  ];

  return (
    <div className="inline-flex flex-col gap-1 rounded-lg border border-gray-800 bg-[#0f0f13]/70 p-1 sm:flex-row">
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            className={cn(
              "w-full rounded-md px-4 py-2 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lsGold/70",
              active
                ? "bg-gradient-to-r from-lsGold/25 via-lsGold/10 to-transparent text-white shadow-[0_0_20px_rgba(208,201,141,0.2)]"
                : "text-gray-400 hover:text-lsGold"
            )}
          >
            <span className="block text-xs font-semibold uppercase tracking-wider">
              {option.label}
            </span>
            <span className="mt-0.5 block text-[10px] text-gray-500">
              {option.description}
            </span>
          </button>
        );
      })}
    </div>
  );
}

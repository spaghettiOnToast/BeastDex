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
      value: "my-beasts",
      label: "My Beasts",
      description: "View and list your beasts for sale.",
    },
    {
      value: "my",
      label: "My Activity",
      description: "Manage your listings and offers.",
    },
  ];

  return (
    <div className="inline-flex flex-row gap-1 rounded-lg border border-gray-800 bg-[#0f0f13]/70 p-1">
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            className={cn(
              "flex-1 rounded-md px-2 sm:px-4 py-1.5 sm:py-2 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/70",
              active
                ? "bg-gradient-to-r from-gold/25 via-gold/10 to-transparent text-white shadow-[0_0_20px_rgba(208,201,141,0.2)]"
                : "text-gray-400 hover:text-gold"
            )}
          >
            <span className="block text-[10px] sm:text-xs font-semibold uppercase tracking-wider">
              {option.label}
            </span>
            <span className="mt-0.5 hidden sm:block text-[10px] text-gray-500">
              {option.description}
            </span>
          </button>
        );
      })}
    </div>
  );
}

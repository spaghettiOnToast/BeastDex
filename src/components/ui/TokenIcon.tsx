type TokenIconProps = {
  symbol: string;
  size?: "xs" | "sm" | "md" | "lg";
  className?: string;
  logoUrl?: string | null;
};

const TOKEN_LOGOS: Record<string, string> = {
  LORDS: "https://imagedelivery.net/0xPAQaDtnQhBs8IzYRIlNg/a3bfe959-50c4-4f89-0aef-b19207d82a00/logo",
  STRK: "https://imagedelivery.net/0xPAQaDtnQhBs8IzYRIlNg/1b126320-367c-48ed-cf5a-ba7580e49600/logo",
  ETH: "https://imagedelivery.net/0xPAQaDtnQhBs8IzYRIlNg/e07829b7-0382-4e03-7ecd-a478c5aa9f00/logo",
  USDC: "https://imagedelivery.net/0xPAQaDtnQhBs8IzYRIlNg/e5aaa970-a998-47e8-bd43-4a3b56b87200/logo",
};

const SIZE_CLASSES = {
  xs: "w-3 h-3",
  sm: "w-4 h-4",
  md: "w-5 h-5",
  lg: "w-6 h-6",
};

/**
 * TokenIcon - Displays token logo with fallback to symbol text
 */
export default function TokenIcon({ symbol, size = "sm", className = "", logoUrl: providedLogoUrl }: TokenIconProps) {
  const logoUrl = providedLogoUrl || TOKEN_LOGOS[symbol.toUpperCase()];
  const sizeClass = SIZE_CLASSES[size];

  if (!logoUrl) {
    // Fallback to text if no logo available
    return (
      <span className={`inline-flex items-center justify-center ${sizeClass} ${className}`}>
        <span className="text-[8px] font-bold text-gray-400">{symbol.slice(0, 2)}</span>
      </span>
    );
  }

  return (
    <img
      src={logoUrl}
      alt={symbol}
      className={`${sizeClass} rounded-full ${className}`}
      onError={(e) => {
        // Fallback to text on image load error
        const target = e.target as HTMLImageElement;
        target.style.display = "none";
        const fallback = document.createElement("span");
        fallback.className = `inline-flex items-center justify-center ${sizeClass} ${className}`;
        fallback.innerHTML = `<span class="text-[8px] font-bold text-gray-400">${symbol.slice(0, 2)}</span>`;
        target.parentNode?.insertBefore(fallback, target);
      }}
    />
  );
}

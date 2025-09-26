import { Link } from "react-router-dom";

type LogoProps = {
  scale?: "sm" | "md";
};

export default function Logo({ scale = "md" }: LogoProps) {
  const sizeClasses = scale === "sm" ? "h-16 w-28" : "h-36 w-56";
  const spacing = scale === "sm" ? "gap-3" : "gap-5";

  return (
    <Link
      to="/"
      className={`flex items-center ${spacing} hover:opacity-80 transition-opacity cursor-pointer`}
    >
      <div className="relative">
        <div className="absolute inset-0 blur-3xl rounded-full bg-[#39ff14]/20" />
        <svg
          className={`relative ${sizeClasses} drop-shadow-[0_0_25px_rgba(57,255,20,0.35)]`}
          viewBox="0 0 220 160"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            <linearGradient id="bdex-body" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#0f172a" />
              <stop offset="50%" stopColor="#020617" />
              <stop offset="100%" stopColor="#0f172a" />
            </linearGradient>
            <linearGradient id="bdex-trim" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#39ff14" />
              <stop offset="50%" stopColor="#2ce0ff" />
              <stop offset="100%" stopColor="#39ff14" />
            </linearGradient>
            <radialGradient id="bdex-core" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#1a223a" />
              <stop offset="70%" stopColor="#050608" />
              <stop offset="100%" stopColor="#010203" />
            </radialGradient>
          </defs>

          <path
            d="M32 76 L12 52 C8 47 11 40 18 40h32"
            fill="none"
            stroke="#39ff14"
            strokeWidth="8"
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity="0.8"
          />
          <path
            d="M188 76 L208 52 C212 47 209 40 202 40h-32"
            fill="none"
            stroke="#39ff14"
            strokeWidth="8"
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity="0.8"
          />

          <rect
            x="28"
            y="32"
            width="164"
            height="96"
            rx="32"
            fill="url(#bdex-body)"
            stroke="url(#bdex-trim)"
            strokeWidth="4"
          />

          <circle
            cx="110"
            cy="80"
            r="36"
            fill="url(#bdex-core)"
            stroke="#102c1c"
            strokeWidth="4"
          />
          <circle
            cx="110"
            cy="80"
            r="20"
            fill="#062a12"
            stroke="#39ff14"
            strokeWidth="3"
          />
          <circle cx="110" cy="80" r="10" fill="#39ff14" />
          <circle cx="110" cy="80" r="4" fill="#2ce0ff" />

          <circle cx="72" cy="56" r="6" fill="#2ce0ff" />
          <circle cx="148" cy="56" r="6" fill="#2ce0ff" />

          <path
            d="M80 110h60"
            stroke="#2ce0ff"
            strokeWidth="4"
            strokeLinecap="round"
            opacity="0.7"
          />
          <path
            d="M64 124h92"
            stroke="#39ff14"
            strokeWidth="3"
            strokeLinecap="round"
            opacity="0.4"
          />

          <path
            d="M90 24 l20-14 20 14"
            fill="none"
            stroke="url(#bdex-trim)"
            strokeWidth="5"
            strokeLinecap="round"
          />
          <path
            d="M90 138 l20 14 20-14"
            fill="none"
            stroke="url(#bdex-trim)"
            strokeWidth="5"
            strokeLinecap="round"
          />
        </svg>
      </div>
      <span className="text-sm uppercase tracking-[0.6em] text-[#39ff14] font-semibold whitespace-nowrap">
        BeastDex
      </span>
    </Link>
  );
}

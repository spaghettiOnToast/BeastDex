import { useState, type MouseEvent, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Check, Copy, RefreshCw } from "lucide-react";

type ProfileHeaderProps = {
  /** "Prefix Suffix" title of the owner's most powerful beast */
  title?: string | null;
  /** username, or a shortened address */
  displayName: string;
  /** displayName is an address (render monospace, keep its case) */
  nameIsAddress?: boolean;
  /** full address for the avatar, tooltip and copy button */
  address?: string | null;
  /** owns every species */
  complete?: boolean;
  collectionHref?: string | null;
  onRefresh: () => void;
  refreshing?: boolean;
  refreshDisabled?: boolean;
  onBack?: (e: MouseEvent<HTMLAnchorElement>) => void;
  /** small status line under the name (e.g. username lookup state) */
  status?: ReactNode;
};

/** Deterministic two-colour gradient from an address, as a simple avatar. */
function avatarGradient(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  const a = h % 360;
  const b = (a + 60 + ((h >> 9) % 120)) % 360;
  return `linear-gradient(135deg, hsl(${a} 70% 55%), hsl(${b} 70% 40%))`;
}

export function ProfileHeader({
  title,
  displayName,
  nameIsAddress = false,
  address,
  complete = false,
  collectionHref,
  onRefresh,
  refreshing = false,
  refreshDisabled = false,
  onBack,
  status,
}: ProfileHeaderProps) {
  const [copied, setCopied] = useState(false);
  const copyAddress = async () => {
    if (!address) return;
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard unavailable: ignore
    }
  };
  // Addresses: the first two hex digits after "0x"; usernames: first letter
  const isHexName = /^0x[0-9a-f]/i.test(displayName);
  const initial = (isHexName ? displayName.slice(2, 4) : displayName.slice(0, 1)).toUpperCase();

  return (
    <header className="space-y-2">
      <Link
        to="/"
        onClick={onBack}
        className="inline-flex items-center gap-1 text-xs text-zinc-500 transition-colors hover:text-zinc-300"
      >
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
        Home
      </Link>

      <div className="flex flex-col gap-4 rounded-xl border border-white/[0.06] bg-surface-raised/70 p-4 sm:flex-row sm:items-center sm:p-5">
        <div className="flex min-w-0 flex-1 items-center gap-3 sm:gap-4">
          <div
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-sm font-bold text-white/90 shadow-inner sm:h-14 sm:w-14"
            style={{ background: avatarGradient(address || displayName) }}
            aria-hidden
          >
            {initial}
          </div>
          <div className="min-w-0 space-y-1">
            {title && (
              <p className="truncate bg-gradient-to-r from-pink-400 via-cyan-300 to-green-300 bg-clip-text text-[11px] font-semibold uppercase tracking-[0.2em] text-transparent sm:text-xs">
                “{title}”
              </p>
            )}
            <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
              <h1
                className={`truncate text-xl font-bold leading-tight text-white sm:text-2xl ${nameIsAddress || isHexName ? "font-mono" : ""}`}
                title={address || undefined}
              >
                {displayName}
              </h1>
              {address && (
                <button
                  type="button"
                  onClick={copyAddress}
                  className="rounded-md p-1 text-zinc-500 transition-colors hover:bg-white/[0.06] hover:text-zinc-200"
                  title={copied ? "Copied" : "Copy address"}
                  aria-label="Copy address"
                >
                  {copied ? <Check className="h-3.5 w-3.5 text-accent" /> : <Copy className="h-3.5 w-3.5" />}
                </button>
              )}
              {complete && (
                <span className="rounded-full border border-[#39ff14]/40 bg-[#39ff14]/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[#39ff14]">
                  🎉 Complete set
                </span>
              )}
            </div>
            {status}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {collectionHref && (
            <Link
              to={collectionHref}
              className="inline-flex flex-1 items-center justify-center rounded-lg bg-[#a855f7] px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white transition-colors hover:bg-[#9333ea] sm:flex-none"
            >
              View collection
            </Link>
          )}
          <button
            type="button"
            onClick={onRefresh}
            disabled={refreshDisabled}
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-white/[0.08] bg-white/[0.04] text-zinc-300 transition-colors hover:bg-white/[0.08] disabled:opacity-50"
            title="Refresh"
            aria-label="Refresh"
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>
    </header>
  );
}

export default ProfileHeader;

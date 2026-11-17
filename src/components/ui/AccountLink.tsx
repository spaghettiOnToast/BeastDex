import { Link } from "react-router-dom";
import { cn } from "../../lib/utils";

/**
 * A wallet shown as its username (or a shortened address) that links to its
 * collection page. Always links by the full address: a shortened address or a
 * missing username would otherwise give a page that can't resolve.
 */
export function AccountLink({
  address,
  name,
  className,
}: {
  address: string | null | undefined;
  name?: string | null;
  className?: string;
}) {
  if (!address) return null;
  const label = name || `${address.slice(0, 6)}…${address.slice(-4)}`;
  return (
    <Link
      to={`/collection/${encodeURIComponent(address.toLowerCase())}`}
      onClick={(e) => e.stopPropagation()}
      title={address}
      className={cn("hover:text-gold hover:underline", className)}
    >
      {label}
    </Link>
  );
}

export default AccountLink;

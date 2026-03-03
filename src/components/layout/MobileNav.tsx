import { useState } from "react";
import { createPortal } from "react-dom";
import { Link, useLocation } from "react-router-dom";
import { Menu, X, BarChart3, Home, Store, Package, type LucideIcon } from "lucide-react";
import { useAccount } from "@starknet-react/core";
import { Button } from "../ui/button";

type NavItem = {
  to: string;
  label: string;
  icon: LucideIcon;
};

type Props = {
  onNavigate?: () => void;
};

export function MobileNav({ onNavigate }: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const location = useLocation();
  const { address } = useAccount();

  const handleNavClick = () => {
    setIsOpen(false);
    onNavigate?.();
  };

  const collectionPath = address ? `/collection/${address}` : "/collection";

  const navItems: NavItem[] = [
    { to: "/", label: "Explore", icon: Home },
    { to: collectionPath, label: "Collection", icon: Package },
    { to: "/marketplace", label: "Marketplace", icon: Store },
    { to: "/statistics", label: "Stats", icon: BarChart3 },
  ];

  const mobileMenu = isOpen ? (
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm md:hidden"
        onClick={() => setIsOpen(false)}
      />

      {/* Bottom sheet */}
      <div
        className="fixed inset-x-0 bottom-0 z-[60] rounded-t-2xl bg-surface-overlay border-t border-white/[0.06] transform transition-transform duration-300 ease-out md:hidden"
      >
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-white/20" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 pb-3">
          <span className="text-sm font-medium text-zinc-400">Navigation</span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsOpen(false)}
            className="p-2 text-zinc-400 hover:text-white hover:bg-white/[0.06]"
            aria-label="Close menu"
          >
            <X className="h-5 w-5" />
          </Button>
        </div>

        {/* Navigation Items */}
        <nav className="px-4 pb-8 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = item.to === "/"
              ? location.pathname === "/"
              : location.pathname.startsWith(item.to);

            return (
              <Link
                key={item.to}
                to={item.to}
                onClick={handleNavClick}
                className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-colors ${
                  isActive
                    ? "bg-white/[0.08] text-white"
                    : "text-zinc-400 hover:bg-white/[0.04] hover:text-white"
                }`}
              >
                <Icon className="h-5 w-5" />
                <span className="font-medium">{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </div>
    </>
  ) : null;

  return (
    <>
      {/* Hamburger Button */}
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setIsOpen(true)}
        className="md:hidden p-2 text-zinc-400 hover:text-white hover:bg-white/[0.06]"
        aria-label="Open menu"
      >
        <Menu className="h-6 w-6" />
      </Button>

      {/* Portal the menu to body */}
      {typeof document !== 'undefined' && createPortal(mobileMenu, document.body)}
    </>
  );
}

export default MobileNav;

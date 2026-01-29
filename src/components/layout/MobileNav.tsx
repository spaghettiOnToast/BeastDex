import { useState } from "react";
import { createPortal } from "react-dom";
import { Link, useLocation } from "react-router-dom";
import { Menu, X, Trophy, Home, Store } from "lucide-react";
import { Button } from "../ui/button";

type Props = {
  onNavigate?: () => void;
};

export function MobileNav({ onNavigate }: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const location = useLocation();

  const handleNavClick = () => {
    setIsOpen(false);
    onNavigate?.();
  };

  const navItems = [
    { to: "/", label: "Home", icon: Home },
    { to: "/marketplace", label: "Marketplace", icon: Store, color: "text-[#0ef]" },
    { to: "/leaderboard", label: "Leaderboard", icon: Trophy, color: "text-[#39ff14]" },
  ];

  const mobileMenu = isOpen ? (
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 z-50 bg-black/70 md:hidden"
        onClick={() => setIsOpen(false)}
      />

      {/* Slide-in Drawer */}
      <div
        className={`fixed top-0 right-0 z-[60] h-full w-72 bg-[#0b0b0f] border-l border-gray-800 transform transition-transform duration-300 ease-in-out md:hidden ${
          isOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-800">
          <span className="text-sm font-semibold text-gray-300 uppercase tracking-wider">Menu</span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsOpen(false)}
            className="p-2 text-gray-400 hover:text-white hover:bg-gray-800"
            aria-label="Close menu"
          >
            <X className="h-5 w-5" />
          </Button>
        </div>

        {/* Navigation Items */}
        <nav className="p-4 space-y-2">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.to;

            return (
              <Link
                key={item.to}
                to={item.to}
                onClick={handleNavClick}
                className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                  isActive
                    ? "bg-gray-800 text-white"
                    : "text-gray-400 hover:bg-gray-800/50 hover:text-white"
                }`}
              >
                <Icon className={`h-5 w-5 ${item.color || ""}`} />
                <span className={`font-medium ${item.color || ""}`}>{item.label}</span>
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
        className="md:hidden p-2 text-gray-300 hover:text-white hover:bg-gray-800"
        aria-label="Open menu"
      >
        <Menu className="h-6 w-6" />
      </Button>

      {/* Portal the menu to body to escape z-index stacking context */}
      {typeof document !== 'undefined' && createPortal(mobileMenu, document.body)}
    </>
  );
}

export default MobileNav;

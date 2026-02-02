import { type ReactNode } from "react";
import { Link } from "react-router-dom";
import { Trophy, Store } from "lucide-react";
import Logo from "../common/Logo";
import SearchBar from "../common/SearchBar";
import WalletButton from "../wallet/WalletButton";
import MobileNav from "../layout/MobileNav";
import { Button } from "../ui/button";
import { useGlobalSearch } from "../../hooks/useGlobalSearch";

type Props = {
  filtersControl?: ReactNode;
  onLogoClick?: () => void;
};

export default function TopBar({ filtersControl, onLogoClick }: Props) {
  const { searchValue, setSearchValue, handleSearch } = useGlobalSearch();

  return (
    <div className="flex items-center gap-2 sm:gap-4">
      {/* Logo - smaller on mobile */}
      <div className="flex-shrink-0">
        <Logo scale="sm" onClick={onLogoClick} />
      </div>

      {/* Search bar - takes more space on mobile */}
      <div className="flex flex-1 items-center gap-2 sm:gap-3 justify-center">
        <SearchBar value={searchValue} onChange={setSearchValue} onSubmit={handleSearch} />
        {filtersControl}
      </div>

      {/* Desktop Navigation - hidden on mobile */}
      <div className="hidden md:flex items-center gap-2 lg:gap-4 flex-shrink-0">
        <Button
          asChild
          className="bg-[#0ef] text-black text-xs font-semibold uppercase tracking-wide hover:bg-[#0bc] hover:text-black h-9 px-3 lg:px-4 lg:min-w-[130px]"
        >
          <Link to="/marketplace">
            <Store className="h-4 w-4" />
            <span className="hidden lg:inline">Marketplace</span>
          </Link>
        </Button>
        <Button
          asChild
          className="bg-[#39ff14] text-black text-xs font-semibold uppercase tracking-wide hover:bg-[#2ecc10] hover:text-black h-9 px-3 lg:px-4 lg:min-w-[130px]"
        >
          <Link to="/leaderboard">
            <Trophy className="h-4 w-4" />
            <span className="hidden lg:inline">Leaderboard</span>
          </Link>
        </Button>
        <WalletButton />
      </div>

      {/* Mobile: Wallet + Hamburger - compact */}
      <div className="flex md:hidden items-center gap-1 flex-shrink-0">
        <WalletButton />
        <MobileNav />
      </div>
    </div>
  );
}

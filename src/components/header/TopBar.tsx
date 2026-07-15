import { type ReactNode } from "react";
import { Link } from "react-router-dom";
import { BarChart3, Store, Package, Sword } from "lucide-react";
import { useAccount } from "@starknet-react/core";
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
  const { address } = useAccount();
  const collectionPath = address ? `/collection/${address}` : "/collection";

  return (
    <div className="flex items-center gap-2 sm:gap-4">
      {/* Logo */}
      <div className="flex-shrink-0">
        <Logo scale="sm" onClick={onLogoClick} />
      </div>

      {/* Search bar */}
      <div className="flex flex-1 items-center gap-2 sm:gap-3 justify-center">
        <SearchBar value={searchValue} onChange={setSearchValue} onSubmit={handleSearch} />
        {filtersControl}
      </div>

      {/* Desktop Navigation */}
      <div className="hidden md:flex items-center gap-2 lg:gap-4 flex-shrink-0">
        <Button
          disabled
          className="bg-[#0ef]/40 text-black/40 text-xs font-semibold uppercase tracking-wide h-9 px-3 lg:px-4 lg:min-w-[130px] cursor-not-allowed"
        >
          <Store className="h-4 w-4" />
          <span className="hidden lg:inline">Marketplace</span>
        </Button>
        <Button
          asChild
          className="bg-[#a855f7] text-white text-xs font-semibold uppercase tracking-wide hover:bg-[#9333ea] hover:text-white h-9 px-3 lg:px-4 lg:min-w-[130px]"
        >
          <Link to={collectionPath}>
            <Package className="h-4 w-4" />
            <span className="hidden lg:inline">Collection</span>
          </Link>
        </Button>
        <Button
          asChild
          className="bg-[#39ff14] text-black text-xs font-semibold uppercase tracking-wide hover:bg-[#2ecc10] hover:text-black h-9 px-3 lg:px-4 lg:min-w-[130px]"
        >
          <Link to="/statistics">
            <BarChart3 className="h-4 w-4" />
            <span className="hidden lg:inline">Statistics</span>
          </Link>
        </Button>
        <Button
          disabled
          className="bg-amber-700/40 text-white/40 text-xs font-semibold uppercase tracking-wide h-9 px-3 lg:px-4 lg:min-w-[130px] cursor-not-allowed"
        >
          <Sword className="h-4 w-4" />
          <span className="hidden lg:inline">Dungeons</span>
        </Button>
        <WalletButton />
      </div>

      {/* Mobile: Wallet + Hamburger */}
      <div className="flex md:hidden items-center gap-1 flex-shrink-0">
        <WalletButton />
        <MobileNav />
      </div>
    </div>
  );
}

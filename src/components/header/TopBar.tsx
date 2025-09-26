import { type ReactNode } from "react";
import { Link } from "react-router-dom";
import { Trophy } from "lucide-react";
import Logo from "../Logo";
import SearchBar from "../SearchBar";
import WalletButton from "../wallet/WalletButton";
import { Button } from "../ui/button";
import { useGlobalSearch } from "../../hooks/useGlobalSearch";

type Props = {
  filtersControl?: ReactNode;
};

export default function TopBar({ filtersControl }: Props) {
  const { searchValue, setSearchValue, handleSearch } = useGlobalSearch();

  return (
    <div className="flex flex-wrap items-center gap-4">
      <Logo scale="sm" />
      <div className="flex flex-1 min-w-[300px] items-center gap-3 justify-center md:justify-center">
        <SearchBar value={searchValue} onChange={setSearchValue} onSubmit={handleSearch} />
        {filtersControl}
      </div>
      <div className="flex items-center gap-4">
        <Button
          asChild
          className="bg-[#39ff14] text-black text-xs font-semibold uppercase tracking-wide hover:bg-[#2ecc10] hover:text-black min-w-[140px] h-10"
        >
          <Link to="/leaderboard">
            <Trophy className="h-4 w-4" />
            Leaderboard
          </Link>
        </Button>
        <WalletButton />
      </div>
    </div>
  );
}

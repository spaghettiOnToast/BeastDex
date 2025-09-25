import { type ReactNode } from "react";
import Logo from "../Logo";
import SearchBar from "../SearchBar";
import WalletButton from "../wallet/WalletButton";
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
      <WalletButton />
    </div>
  );
}

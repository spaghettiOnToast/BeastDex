import { ChevronDown } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import { Button } from "../ui/button";

export type SortOption = "default" | "beast";

type SortDropdownProps = {
  value: SortOption;
  onChange: (value: SortOption) => void;
};

const OPTIONS: Array<{ label: string; value: SortOption }> = [
  { label: "Default", value: "default" },
  { label: "Beast (A → Z)", value: "beast" },
];

export function SortDropdown({ value, onChange }: SortDropdownProps) {
  const currentOption = OPTIONS.find(option => option.value === value) || OPTIONS[0];

  return (
    <div className="inline-flex items-center gap-2 text-[11px] text-gray-400">
      <span className="uppercase tracking-wide text-[10px] text-gray-500">Sort</span>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className="h-7 border-gray-700 bg-black px-2 text-[11px] text-gray-200 hover:bg-gray-800 hover:text-gray-100 focus-visible:ring-lsGreen"
          >
            {currentOption.label}
            <ChevronDown className="ml-1 h-3 w-3" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-[120px] border-gray-700 bg-black">
          {OPTIONS.map((option) => (
            <DropdownMenuItem
              key={option.value}
              onClick={() => onChange(option.value)}
              className="text-[11px] text-gray-200 focus:bg-gray-800 focus:text-gray-100 cursor-pointer"
            >
              {option.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

export default SortDropdown;

import { Check, ChevronDown } from "lucide-react";
import { Button } from "../ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";

export type FilterOption<T> = {
  value: T;
  /** text in the menu */
  label: string;
  /** short text on the button (defaults to label) */
  short?: string;
  count?: number;
  /** draw a separator above this option */
  separatorBefore?: boolean;
};

type Props<T> = {
  /** button prefix, e.g. "Tier" */
  name: string;
  value: T;
  /** the "no filter" value */
  allValue: T;
  options: FilterOption<T>[];
  onChange: (value: T) => void;
};

/** A filter dropdown styled like the Sort / Grade dropdowns. Options with a 0 count are greyed out. */
export function OptionFilterDropdown<T extends string | number>({ name, value, allValue, options, onChange }: Props<T>) {
  const active = value !== allValue;
  const current = options.find((o) => o.value === value);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={`h-8 px-2 sm:px-3 font-medium border ${
            active
              ? "border-[#e2b94c]/40 bg-[#e2b94c]/10 text-[#e2b94c] hover:bg-[#e2b94c]/15"
              : "border-white/[0.06] bg-white/[0.04] text-zinc-300 hover:bg-white/[0.08] hover:text-white"
          }`}
        >
          <span className={`mr-1 sm:mr-1.5 text-xs sm:text-sm ${active ? "text-[#e2b94c]/70" : "text-zinc-500"}`}>{name}:</span>
          <span className="text-xs sm:text-sm">{current?.short ?? current?.label ?? String(value)}</span>
          <ChevronDown className="ml-1 sm:ml-1.5 h-3 w-3 sm:h-3.5 sm:w-3.5 opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-[170px] border border-white/[0.06] bg-[#18181b] text-zinc-200">
        {options.map((o) => (
          <div key={String(o.value)}>
            {o.separatorBefore && <DropdownMenuSeparator className="bg-white/[0.06]" />}
            <DropdownMenuItem
              onClick={() => onChange(o.value)}
              disabled={o.count === 0}
              className="cursor-pointer justify-between gap-3 text-xs sm:text-sm text-zinc-200 hover:bg-white/[0.06] hover:text-white data-[disabled]:opacity-40"
            >
              <span className="inline-flex items-center gap-1.5">
                <Check className={`h-3.5 w-3.5 ${value === o.value ? "text-[#e2b94c]" : "invisible"}`} />
                {o.label}
              </span>
              {o.count !== undefined && <span className="tabular-nums text-zinc-500">{o.count}</span>}
            </DropdownMenuItem>
          </div>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default OptionFilterDropdown;

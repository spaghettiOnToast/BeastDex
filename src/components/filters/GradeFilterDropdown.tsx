import { Check, ChevronDown } from "lucide-react";
import { Button } from "../ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import type { Beast } from "../../services/beast";
import { countByGrade, GRADES, gradeFilterLabel, type GradeFilter } from "../../utils/gradeFilter";

type Props = {
  value: GradeFilter;
  onChange: (value: GradeFilter) => void;
  /** Beasts the filter applies to, for the per-grade counts. */
  beasts: Array<Pick<Beast, "cardGrade">>;
};

/** Card grade filter styled like the Sort dropdown. Grades nobody holds are greyed out. */
export function GradeFilterDropdown({ value, onChange, beasts }: Props) {
  const counts = countByGrade(beasts);
  const active = value !== "all";

  const item = (filter: GradeFilter, count?: number) => {
    const empty = count === 0;
    return (
      <DropdownMenuItem
        key={String(filter)}
        onClick={() => onChange(filter)}
        disabled={empty}
        className="cursor-pointer justify-between gap-3 text-xs sm:text-sm text-zinc-200 hover:bg-white/[0.06] hover:text-white data-[disabled]:opacity-40"
      >
        <span className="inline-flex items-center gap-1.5">
          <Check className={`h-3.5 w-3.5 ${value === filter ? "text-[#e2b94c]" : "invisible"}`} />
          {gradeFilterLabel(filter)}
        </span>
        {count !== undefined && <span className="tabular-nums text-zinc-500">{count}</span>}
      </DropdownMenuItem>
    );
  };

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
          <span className={`mr-1 sm:mr-1.5 text-xs sm:text-sm ${active ? "text-[#e2b94c]/70" : "text-zinc-500"}`}>Grade:</span>
          <span className="text-xs sm:text-sm">{value === "all" ? "All" : value === "none" ? "None" : value}</span>
          <ChevronDown className="ml-1 sm:ml-1.5 h-3 w-3 sm:h-3.5 sm:w-3.5 opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-[170px] border border-white/[0.06] bg-[#18181b] text-zinc-200">
        {item("all", beasts.length)}
        <DropdownMenuSeparator className="bg-white/[0.06]" />
        {GRADES.map((g) => item(g, counts.get(g) ?? 0))}
        {(counts.get("none") ?? 0) > 0 && item("none", counts.get("none"))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default GradeFilterDropdown;

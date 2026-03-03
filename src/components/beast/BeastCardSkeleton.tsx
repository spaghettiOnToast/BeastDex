import { Skeleton } from "../ui/skeleton";

export function BeastCardSkeleton() {
  return (
    <div className="w-full max-w-[280px] overflow-hidden rounded-xl border border-white/[0.06] bg-surface-raised">
      <div className="relative aspect-square bg-white/[0.02] overflow-hidden">
        <Skeleton className="h-full w-full rounded-none" />
      </div>
      <div className="flex flex-col items-start gap-2 p-3">
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-3 w-1/2" />
      </div>
    </div>
  );
}

export default BeastCardSkeleton;

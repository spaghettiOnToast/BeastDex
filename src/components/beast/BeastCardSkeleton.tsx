import { Skeleton } from "../ui/skeleton";

export function BeastCardSkeleton() {
  return (
    <div className="w-full overflow-hidden rounded-xl" style={{ background: "#1b1b1f" }}>
      <div className="p-2 flex items-center gap-2">
        <Skeleton className="h-5 w-2 bg-white/[0.06]" />
        <Skeleton className="h-6 flex-1 bg-white/[0.06]" />
        <Skeleton className="h-4 w-4 bg-white/[0.06]" />
      </div>
      <div className="px-2">
        <Skeleton className="w-full bg-white/[0.04]" style={{ aspectRatio: "220/190", borderRadius: 6 }} />
      </div>
      <div className="flex gap-1 p-2 pt-1">
        <Skeleton className="flex-1 h-8 bg-white/[0.06] rounded" />
        <Skeleton className="flex-1 h-8 bg-white/[0.06] rounded" />
        <Skeleton className="flex-1 h-8 bg-white/[0.06] rounded" />
      </div>
      <div className="flex gap-1 px-2 pb-2">
        <Skeleton className="flex-1 h-9 bg-white/[0.06] rounded" />
        <Skeleton className="flex-1 h-9 bg-white/[0.06] rounded" />
      </div>
    </div>
  );
}

export default BeastCardSkeleton;

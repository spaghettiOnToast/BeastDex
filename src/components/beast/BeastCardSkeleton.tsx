import { Card, CardContent, CardFooter } from "../ui/card";
import { Skeleton } from "../ui/skeleton";

export function BeastCardSkeleton() {
  return (
    <Card className="w-full max-w-[280px] overflow-hidden bg-card/50 backdrop-blur-sm border-muted/50">
      <CardContent className="p-0">
        <div className="relative aspect-square bg-gradient-to-br from-secondary/20 to-background rounded-t-lg overflow-hidden">
          <Skeleton className="h-full w-full rounded-none" />
        </div>
      </CardContent>
      <CardFooter className="flex flex-col items-start gap-2 p-4 bg-gradient-to-b from-background/50 to-background">
        <Skeleton className="h-5 w-3/4" />
        <Skeleton className="h-4 w-1/2" />
      </CardFooter>
    </Card>
  );
}

export default BeastCardSkeleton;
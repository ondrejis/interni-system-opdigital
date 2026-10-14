import { Skeleton } from "@rebar/ui";

export default function Loading() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Načítání">
      <Skeleton className="h-10 w-2/3" />
      <Skeleton className="h-40" />
      <Skeleton className="h-40" />
    </div>
  );
}

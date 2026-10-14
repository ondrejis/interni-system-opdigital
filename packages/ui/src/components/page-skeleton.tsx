import { cn } from "../lib/cn";
import { Skeleton } from "./badges";

/**
 * Kostra stránky, která se ukáže hned po kliknutí v navigaci, ještě než dorazí data.
 * Drží stejné rozměry jako skutečná stránka (záhlaví, nástrojová lišta, řádky), takže obsah nepoposkočí.
 */
export function PageSkeleton({ rows = 9, className }: { rows?: number; className?: string }) {
  return (
    <div
      className={cn("flex h-full min-h-0 flex-col", className)}
      role="status"
      aria-busy="true"
      aria-label="Načítám"
    >
      <div className="flex h-11 shrink-0 items-center border-b border-line px-4">
        <Skeleton className="h-4 w-40" />
      </div>
      <div className="flex shrink-0 items-center gap-2 border-b border-line px-4 py-2">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-8 w-24" />
        <Skeleton className="ml-auto h-8 w-28" />
      </div>
      <div className="min-h-0 flex-1 space-y-px overflow-hidden p-2">
        {Array.from({ length: rows }, (_, i) => (
          <Skeleton key={i} className="h-9 w-full" />
        ))}
      </div>
    </div>
  );
}

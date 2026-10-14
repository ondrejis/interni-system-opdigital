"use client";

import { Button, Notice, Skeleton } from "@rebar/ui";
import type { ReactNode } from "react";

/** Odkaz vzhledem tlačítka `sm` (stažení souboru je odkaz, ne tlačítko). */
export const LINK_BUTTON =
  "inline-flex h-7 shrink-0 cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-md border border-line-strong bg-bg px-2.5 text-sm font-medium text-fg transition-colors duration-150 hover:bg-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent-line)] pointer-coarse:min-h-11 [&_svg]:size-4 [&_svg]:shrink-0";

/** Načítání seznamu: kostry s oznámením pro čtečky. */
export function ListSkeleton({ label }: { label: string }) {
  return (
    <div className="space-y-3" role="status" aria-busy="true" aria-label={label}>
      <Skeleton className="h-9" />
      <Skeleton className="h-9" />
      <Skeleton className="h-9" />
    </div>
  );
}

/** Chyba načtení s možností zkusit znovu. */
export function LoadError({
  title,
  message,
  onRetry,
}: {
  title: string;
  message?: string | undefined;
  onRetry: () => void;
}) {
  return (
    <Notice tone="error" title={title}>
      <p>{message ?? "Zkuste to prosím znovu."}</p>
      <Button className="mt-2" size="sm" onClick={onRetry}>
        Zkusit znovu
      </Button>
    </Notice>
  );
}

/** Karta tabulky v záložce: rámeček přes celou šířku, tabulka uvnitř. */
export function TableCard({ children }: { children: ReactNode }) {
  return <div className="overflow-x-auto rounded-xl border border-line bg-bg">{children}</div>;
}

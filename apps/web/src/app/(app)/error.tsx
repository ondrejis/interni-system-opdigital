"use client";

import { EmptyState, PageHeader } from "@rebar/ui";
import Link from "next/link";

/**
 * Neočekávaná chyba při zobrazení stránky: srozumitelná věta a kód chyby (`digest`), podle kterého se chyba najde
 * v logu serveru. Podrobnosti chyby se uživateli neukazují.
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader breadcrumbs={[{ label: "Chyba" }]} />
      <div role="alert" className="flex flex-1 items-center justify-center p-6">
        <EmptyState
          title="Něco se nepovedlo"
          description={`Stránku se nepodařilo zobrazit. Zkuste to prosím znovu${
            error.digest ? ` (kód chyby: ${error.digest})` : ""
          }.`}
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <button
                type="button"
                onClick={reset}
                className="inline-flex h-8 items-center rounded-md bg-accent px-3 font-medium text-accent-fg transition-colors hover:bg-[var(--accent-hover)]"
              >
                Zkusit znovu
              </button>
              <Link
                href="/"
                className="inline-flex h-8 items-center rounded-md border border-border px-3 font-medium transition-colors hover:bg-subtle"
              >
                Zpět na přehled
              </Link>
            </div>
          }
        />
      </div>
    </div>
  );
}

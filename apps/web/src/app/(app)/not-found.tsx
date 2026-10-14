import { EmptyState, PageHeader } from "@rebar/ui";
import Link from "next/link";

/** Neexistující adresa nebo stránka, ke které uživatel nemá přístup (obojí se tváří stejně). */
export default function NotFound() {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader breadcrumbs={[{ label: "Stránka nenalezena" }]} />
      <div className="flex flex-1 items-center justify-center p-6">
        <EmptyState
          title="Stránka nenalezena"
          description="Adresa neexistuje, nebo k ní nemáte přístup."
          action={
            <Link
              href="/"
              className="inline-flex h-8 items-center rounded-md bg-accent px-3 font-medium text-accent-fg transition-colors hover:bg-[var(--accent-hover)]"
            >
              Zpět na přehled
            </Link>
          }
        />
      </div>
    </div>
  );
}

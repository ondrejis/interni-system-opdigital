import Link from "next/link";

/**
 * Neexistující adresa mimo aplikační rámec (tisk, odkaz investora…): česky a bez navigace. V aplikaci samotné
 * zachytává adresy stránka `(app)/not-found.tsx`.
 */
export default function RootNotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="max-w-sm text-center">
        <h1 className="text-lg font-semibold">Stránka nenalezena</h1>
        <p className="mt-1 text-muted">Adresa neexistuje, nebo k ní nemáte přístup.</p>
        <Link
          href="/"
          className="mt-4 inline-flex h-10 items-center rounded-md bg-accent px-4 font-medium text-accent-fg"
        >
          Zpět na přehled
        </Link>
      </div>
    </main>
  );
}

import { ButtonLink } from "@rebar/ui";

export default function TerminalNotFound() {
  return (
    <div className="space-y-3 rounded-2xl border border-line bg-bg p-5">
      <h1 className="text-xl font-semibold">Stránka nenalezena</h1>
      <p className="text-base text-muted">
        Tato obrazovka v terminálu neexistuje nebo k ní nemáte přístup.
      </p>
      <ButtonLink href="/t" variant="primary" className="w-full">
        Zpět na úvod
      </ButtonLink>
    </div>
  );
}

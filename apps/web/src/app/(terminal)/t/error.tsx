"use client";

import { BigButton } from "@rebar/ui";

export default function TerminalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="space-y-3 rounded-2xl border border-line bg-bg p-5" role="alert">
      <h1 className="text-xl font-semibold">Něco se nepovedlo</h1>
      <p className="text-base text-muted">
        Stránku se nepodařilo zobrazit. Zápisy uložené v telefonu jsou v bezpečí. Zkuste to znovu.
      </p>
      <BigButton variant="primary" onClick={reset}>
        Zkusit znovu
      </BigButton>
    </div>
  );
}

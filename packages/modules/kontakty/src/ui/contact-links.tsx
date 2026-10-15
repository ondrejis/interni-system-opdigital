"use client";

import { Button, errorToast, successToast } from "@rebar/ui";
import { formatPhone } from "../normalize";

/** Zkopíruje text do schránky s potvrzením (KON-02). */
export async function copyText(text: string, what: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    successToast(`${what} je zkopírován.`);
  } catch {
    errorToast("Kopírování se nepovedlo. Označte text a zkopírujte ho ručně.");
  }
}

/** Telefon: odkaz „zavolat“ (`tel:`) a tlačítko kopírovat. */
export function PhoneLink({ value }: { value: string }) {
  return (
    <span className="inline-flex items-center gap-1" data-testid="phone-link">
      <a className="hover:underline" href={`tel:${value.replace(/[^\d+]/g, "")}`} title="Zavolat">
        {formatPhone(value)}
      </a>
      <Button
        size="sm"
        variant="ghost"
        aria-label={`Kopírovat telefon ${value}`}
        onClick={() => void copyText(value, "Telefon")}
      >
        Kopírovat
      </Button>
    </span>
  );
}

/** E-mail: odkaz „napsat“ (`mailto:`) a tlačítko kopírovat. */
export function EmailLink({ value }: { value: string }) {
  return (
    <span className="inline-flex items-center gap-1" data-testid="email-link">
      <a className="break-all hover:underline" href={`mailto:${value}`} title="Napsat e-mail">
        {value}
      </a>
      <Button
        size="sm"
        variant="ghost"
        aria-label={`Kopírovat e-mail ${value}`}
        onClick={() => void copyText(value, "E-mail")}
      >
        Kopírovat
      </Button>
    </span>
  );
}

/** Hlavní telefon a e-mail osoby nebo organizace s rychlým voláním, psaním a kopírováním. */
export function ContactLinks({ phone, email }: { phone?: string | null; email?: string | null }) {
  if (!phone && !email) return <span className="text-muted">bez kontaktu</span>;
  return (
    <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
      {phone && <PhoneLink value={phone} />}
      {email && <EmailLink value={email} />}
    </span>
  );
}

/**
 * České číslo účtu → IBAN a text pro QR platbu (SPD). Vstup `123456789/0100` nebo `19-2000145399/0800`
 * (předčíslí je nepovinné). Neplatný nebo cizí formát vrátí `null`, doklad se pak vytiskne bez QR.
 */

function mod97(numeric: string): number {
  let rest = 0;
  for (const ch of numeric) rest = (rest * 10 + Number(ch)) % 97;
  return rest;
}

export function czAccountToIban(account: string | null | undefined): string | null {
  if (!account) return null;
  const m = /^\s*(?:(\d{1,6})-)?(\d{2,10})\/(\d{4})\s*$/.exec(account);
  if (!m) return null;
  const [, prefix = "", number = "", bank = ""] = m;
  const bban = bank + prefix.padStart(6, "0") + number.padStart(10, "0");
  // CZ = 12 35, kontrolní číslice 00 se přidají na konec před výpočtem
  const check = String(98 - mod97(`${bban}123500`)).padStart(2, "0");
  return `CZ${check}${bban}`;
}

export function isValidIban(iban: string): boolean {
  const s = iban.replace(/\s/g, "").toUpperCase();
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(s)) return false;
  const rearranged = s.slice(4) + s.slice(0, 4);
  const numeric = rearranged.replace(/[A-Z]/g, (c) => String(c.charCodeAt(0) - 55));
  return mod97(numeric) === 1;
}

/** Řetězec pro „QR Platbu“ (formát SPD 1.0). Zpráva se zbaví znaků, které formát nepovoluje. */
export function spdPayload(p: {
  iban: string;
  amountMinor: number;
  currency: string;
  variableSymbol?: string | null;
  message?: string;
}): string {
  const clean = (s: string) =>
    s
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toUpperCase()
      .replace(/[^A-Z0-9 .,:/+-]/g, " ")
      .replace(/ {2,}/g, " ")
      .trim()
      .slice(0, 60);
  const parts = [
    "SPD*1.0",
    `ACC:${p.iban}`,
    `AM:${(p.amountMinor / 100).toFixed(2)}`,
    `CC:${p.currency}`,
  ];
  if (p.variableSymbol) parts.push(`X-VS:${p.variableSymbol.replace(/\D/g, "").slice(0, 10)}`);
  if (p.message) parts.push(`MSG:${clean(p.message)}`);
  return parts.join("*");
}

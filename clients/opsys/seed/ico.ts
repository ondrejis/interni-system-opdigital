/**
 * Formálně platné IČO (8 číslic, kontrolní součet modulo 11) ze sedmimístného základu.
 * Demo firmy jsou vymyšlené; IČO prochází kontrolou, ale nemusí odpovídat žádné skutečné firmě.
 */
export function icoFrom(base: number): string {
  const s = String(base).padStart(7, "0").slice(-7);
  const sum = [...s].reduce((a, c, i) => a + Number(c) * (8 - i), 0);
  const check = (11 - (sum % 11)) % 10;
  return `${s}${check}`;
}

export function isValidIco(ico: string): boolean {
  if (!/^\d{8}$/.test(ico)) return false;
  return icoFrom(Number(ico.slice(0, 7))) === ico;
}

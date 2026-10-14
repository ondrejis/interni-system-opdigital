// Čisté funkce vzorů číselných řad (bez databáze), použitelné i v prohlížeči.

/** Vzor čísla: `{YYYY}` `{YY}` `{MM}` a `{NNN…}` (počet N = počet číslic). */
export function formatNumber(pattern: string, seq: number, date: Date): string {
  return pattern
    .replace(/\{YYYY\}/g, String(date.getFullYear()))
    .replace(/\{YY\}/g, String(date.getFullYear()).slice(2))
    .replace(/\{MM\}/g, String(date.getMonth() + 1).padStart(2, "0"))
    .replace(/\{(N+)\}/g, (_, n: string) => String(seq).padStart(n.length, "0"));
}

export function validatePattern(pattern: string): string | null {
  if (!/\{N+\}/.test(pattern)) return "Vzor musí obsahovat pořadové číslo, např. {NNNN}.";
  if ((pattern.match(/\{N+\}/g) ?? []).length > 1)
    return "Vzor smí obsahovat pořadové číslo jen jednou.";
  if (pattern.length > 60) return "Vzor je příliš dlouhý.";
  const rest = pattern.replace(/\{(YYYY|YY|MM|N+)\}/g, "");
  if (/[{}]/.test(rest))
    return "Vzor obsahuje neznámou proměnnou. Povoleno: {YYYY} {YY} {MM} {NNN}.";
  return null;
}

/**
 * Upozornění (ne chyba) na vzor, který je platný, ale nevhodný. Roční řada bez roku ve vzoru po Novém roce
 * znovu přidělí stejná čísla (FV-0001 podruhé).
 */
export function patternWarning(pattern: string, reset: "yearly" | "never"): string | null {
  if (reset === "yearly" && !/\{(YYYY|YY)\}/.test(pattern))
    return "Řada se každý rok začíná od jedničky, ale vzor neobsahuje rok. Čísla se tak po Novém roce budou opakovat.";
  return null;
}

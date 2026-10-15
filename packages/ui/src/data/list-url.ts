import { OPERATORS, type Condition, type FilterGroup } from "@rebar/core/shared";

/** Parametr adresy s filtrem seznamu (`?f=<base64url JSON>`); adresu jde poslat dál (SPOL-09). */
export const FILTER_PARAM = "f";
/** Parametr adresy s hledáním v seznamu. */
export const SEARCH_PARAM = "q";

const MAX_LEN = 4000;
const OPS = new Set<string>(OPERATORS);

const b64 = (s: string) =>
  btoa(String.fromCharCode(...new TextEncoder().encode(s)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
const unb64 = (s: string) =>
  new TextDecoder().decode(
    Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0)),
  );

/** Filtr do adresy; prázdný filtr = `null` (parametr se z adresy odstraní). */
export function encodeFilter(f: FilterGroup | undefined): string | null {
  if (!f || !f.conditions.length) return null;
  return b64(JSON.stringify(f));
}

function validNode(n: unknown, depth: number): n is Condition | FilterGroup {
  if (!n || typeof n !== "object" || depth > 4) return false;
  const o = n as Record<string, unknown>;
  if (Array.isArray(o.conditions))
    return (
      (o.op === "and" || o.op === "or") &&
      o.conditions.length <= 30 &&
      o.conditions.every((c) => validNode(c, depth + 1))
    );
  return typeof o.attr === "string" && o.attr.length <= 80 && OPS.has(String(o.op));
}

/**
 * Filtr z adresy. Poškozený nebo podvržený parametr (špatný JSON, neznámý operátor, příliš velký) vrátí `undefined`,
 * seznam se pak zobrazí bez filtru. Atributy, které entita nezná, řeší server (chyba filtru), ne tato funkce.
 */
export function decodeFilter(s: string | null | undefined): FilterGroup | undefined {
  if (!s || s.length > MAX_LEN) return undefined;
  try {
    const f: unknown = JSON.parse(unb64(s));
    return validNode(f, 0) && "conditions" in f ? f : undefined;
  } catch {
    return undefined;
  }
}

/** Je filtr přesně jedna předvolba? Porovnává strukturu, takže pořadí klíčů nevadí. */
export function sameFilter(a: FilterGroup | undefined, b: FilterGroup | undefined): boolean {
  const norm = (f: FilterGroup | undefined) => (f && f.conditions.length ? JSON.stringify(f) : "");
  return norm(a) === norm(b);
}

/** Adresa seznamu se zapsaným filtrem a hledáním (ostatní parametry zůstanou). */
export function withListParams(
  href: string,
  p: { filters?: FilterGroup | undefined; q?: string | undefined },
): string {
  const url = new URL(href, "http://x");
  const f = encodeFilter(p.filters);
  if (f) url.searchParams.set(FILTER_PARAM, f);
  else url.searchParams.delete(FILTER_PARAM);
  if (p.q) url.searchParams.set(SEARCH_PARAM, p.q);
  else url.searchParams.delete(SEARCH_PARAM);
  return `${url.pathname}${url.search}${url.hash}`;
}
